-- =====================================================================
-- 0043_ministerio_inactivo_y_candidatos.sql
-- Tres ajustes al flujo de ministerios.
--
-- A. UN MINISTERIO DADO DE BAJA YA NO DA PERMISOS
-- -----------------------------------------------
-- `es_lider_de_ministerio` y `participo_del_ministerio` (0024) solo miraban
-- `ministerio_lideres` / `ministerio_miembros`, y la baja (`activo = false`,
-- lib/queries/ministerios.ts) no toca a los líderes. La app lo escondía —
-- `mis_ministerios()` y `min_select` filtran por `activo`—, pero con el anon
-- key y un cliente REST cualquiera, el líder de un ministerio dado de baja
-- seguía pudiendo registrar reuniones con ofrenda, publicar anuncios (que
-- además les seguían llegando a sus integrantes, por el helper de
-- participación), tocar el roster y subir la foto.
--
-- En discipulados el problema no existe porque la baja libera al líder
-- (`discipulador_id = null`, 0006). Acá los líderes se conservan a propósito:
-- reactivar un ministerio (admin) lo devuelve tal como estaba. Por eso el
-- corte va en los dos helpers y no en la baja: todas las policies y RPC que
-- los llaman (0024-0026, 0033, 0038, 0039) lo heredan a la vez. El admin no
-- pasa por acá (`es_admin()` va siempre primero en cada condición).
--
-- B. `candidatos_para_ministerio` FILTRA POR UMBRAL
-- -------------------------------------------------
-- Ordenaba por similitud y cortaba en 15 sin piso: siempre devolvía a alguien,
-- así que "no está en el padrón" no era un resultado confiable y la pantalla
-- dejaba crear una ficha en cualquier momento — la vía de la ficha duplicada
-- que 0028 cerró para discipulados. Pasa a ser espejo de
-- `candidatos_para_discipulado` (0028) en el puntaje: similitud pg_trgm,
-- subcadena (strpos, 0.8) y teléfono (1.0), con piso 0.2. Se mantiene lo que
-- la distingue: excluye a quien ya está activo en el roster (en vez de
-- marcarlo), así que la firma no cambia.
--
-- C. `integrantes_de_mi_ministerio` DEVUELVE `miembro_activo`
-- -----------------------------------------------------------
-- Quien fue dado de baja de la iglesia (`miembros.activo = false`, 0022) sigue
-- en el roster —se conserva a propósito, igual que en `participaciones`—, pero
-- la pantalla no tenía cómo marcarlo. Cambia el `returns table`, así que hay
-- que dropear y recrear la función.
-- =====================================================================

-- ===== A. Helpers =====

create or replace function public.es_lider_de_ministerio(p_ministerio uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministerio_lideres l
    join ministerios m on m.id = l.ministerio_id
    where l.ministerio_id = p_ministerio and l.profile_id = auth.uid() and m.activo
  );
$$;

create or replace function public.participo_del_ministerio(p_ministerio uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministerio_miembros mm
    join profiles p on p.miembro_id = mm.miembro_id
    join ministerios m on m.id = mm.ministerio_id
    where mm.ministerio_id = p_ministerio and mm.activo and p.id = auth.uid() and m.activo
  );
$$;

-- ===== B. Candidatos con umbral =====

create or replace function public.candidatos_para_ministerio(
  p_ministerio uuid,
  p_texto      text
)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  telefono_parcial text,
  similitud        real
)
language plpgsql security definer set search_path = public stable as $$
declare
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_digitos text;
begin
  if not (es_admin() or es_lider_de_ministerio(p_ministerio)) then
    raise exception 'No autorizado: no liderás este ministerio';
  end if;

  if length(v_texto) < 2 then
    return;
  end if;

  v_digitos := nullif(regexp_replace(v_texto, '\D', '', 'g'), '');

  -- Mismo puntaje que candidatos_para_discipulado (0028): la más alta gana.
  return query
    select c.id, c.nombre, c.apellido, c.telefono_parcial, c.similitud
    from (
      select
        m.id,
        m.nombre,
        m.apellido,
        case when m.telefono is null then null
             else repeat('•', greatest(length(regexp_replace(m.telefono, '\D', '', 'g')) - 4, 0))
                  || right(regexp_replace(m.telefono, '\D', '', 'g'), 4)
        end as telefono_parcial,
        greatest(
          similarity(v_texto, coalesce(m.nombre, '') || ' ' || coalesce(m.apellido, '')),
          case when strpos(
                      lower(btrim(coalesce(m.nombre, '') || ' ' || coalesce(m.apellido, ''))),
                      lower(v_texto)
                    ) > 0
               then 0.8::real else 0.0::real
          end,
          case when v_digitos is not null and length(v_digitos) >= 6 and m.telefono is not null
                    and right(regexp_replace(m.telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
               then 1.0::real else 0.0::real
          end
        ) as similitud
      from miembros m
      where m.activo
        and not exists (
          select 1 from ministerio_miembros mm
          where mm.ministerio_id = p_ministerio and mm.miembro_id = m.id and mm.activo
        )
    ) c
    where c.similitud >= 0.2
    order by c.similitud desc, c.nombre, c.apellido
    limit 15;
end;
$$;

revoke execute on function public.candidatos_para_ministerio(uuid, text) from public, anon;
grant execute on function public.candidatos_para_ministerio(uuid, text) to authenticated;

-- ===== C. Roster con el estado en la iglesia =====

drop function if exists public.integrantes_de_mi_ministerio(uuid);

create function public.integrantes_de_mi_ministerio(p_ministerio uuid)
returns table (
  miembro_id     uuid,
  nombre         text,
  apellido       text,
  telefono       text,
  activo         boolean,  -- en el roster del ministerio
  miembro_activo boolean   -- en la iglesia (miembros.activo, 0022)
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not (es_admin() or es_lider_de_ministerio(p_ministerio)) then
    raise exception 'No autorizado: no liderás este ministerio';
  end if;

  return query
    select m.id, m.nombre, m.apellido,
           case when m.mostrar_contacto then m.telefono end,
           mm.activo,
           m.activo
    from ministerio_miembros mm
    join miembros m on m.id = mm.miembro_id
    where mm.ministerio_id = p_ministerio
    order by m.nombre, m.apellido;
end;
$$;

revoke execute on function public.integrantes_de_mi_ministerio(uuid) from public, anon;
grant execute on function public.integrantes_de_mi_ministerio(uuid) to authenticated;
