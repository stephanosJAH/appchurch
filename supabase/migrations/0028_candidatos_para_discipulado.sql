-- =====================================================================
-- 0028_candidatos_para_discipulado.sql
-- Sumar al grupo a alguien que YA está en el padrón.
--
-- Contexto: la única forma de agregar un discípulo desde la pantalla del
-- grupo era `agregar_discipulo` (0003) — crear una ficha nueva con el nombre
-- tipeado. Si la persona ya existía en `miembros` (la cargó otro
-- discipulador, entró por `resolver_identidad_pendiente`, o la sumó un
-- ministerio) quedaba duplicada: dos fichas y el historial partido al medio.
-- Es el mismo agujero que 0018 cerró para las cuentas pendientes y 0024 para
-- el roster de ministerios.
--
-- Espejo declarado de `candidatos_para_ministerio` (0024), con dos
-- diferencias que salen del modelo de permisos y de cómo se usa:
--   * autoriza con `es_admin() or es_discipulador_de(grupo)`: en discipulados
--     el permiso es una igualdad contra el dueño del grupo, no pertenencia a
--     un conjunto;
--   * filtra por umbral de similitud. La de ministerios ordena por similitud
--     y corta en 15 sin piso, así que siempre devuelve algo: acá "no hay
--     coincidencia" tiene que ser un resultado de verdad, porque es de lo que
--     depende el fallback de la pantalla (sin coincidencias se crea la ficha
--     con el nombre tipeado, como hasta ahora).
--
-- Buscar va por RPC y no por un select a `miembros`: desde 0014 la RLS del
-- padrón solo deja leer al admin y al discipulador de esa persona — o sea, a
-- nadie que todavía no la tenga en su grupo, que es justo quien busca. La
-- vista `directorio` tampoco sirve de atajo: desde 0017 excluye a los menores
-- de 18, justo la población de la mayoría de los discipulados.
--
-- Qué NO filtra, a propósito: **nadie del padrón activo queda afuera de la
-- búsqueda**. Quien ya está en el roster de este grupo sale igual, marcado con
-- `ya_participa`; la pantalla lo muestra como "ya está en el grupo" en vez de
-- ofrecer sumarlo. Es la corrección de la primera versión, que lo excluía como
-- hace la de ministerios (0024): al no venir en la respuesta, la pantalla
-- concluía "no está en el padrón" y ofrecía crear una ficha nueva — o sea que
-- el único camino que quedaba era justo el duplicado que esta RPC vino a
-- evitar. Una búsqueda no puede contestar "no existe" cuando la respuesta es
-- "ya lo tenés".
--
-- Quien participa de OTRO discipulado también aparece, y sin decir de cuál:
-- cambiar de grupo es un caso real y frecuente, pero el mapa del padrón no es
-- de quien busca. La participación vieja la da de baja el líder de ese grupo
-- o un admin.
--
-- Sumar a alguien del padrón no necesita RPC: es un insert sobre
-- `participaciones`, que la policy `part_all` (0002) ya autoriza al líder del
-- grupo. Solo la búsqueda necesita saltear la RLS.
--
-- Depende de 0002 (es_admin, es_discipulador_de, policy de participaciones),
-- 0014 (RLS del padrón), 0018 (pg_trgm) y 0022 (miembros.activo).
-- =====================================================================

-- El `returns table` cambió de forma (se sumó `ya_participa`) y eso
-- `create or replace` no lo puede hacer: va drop + create. Re-aplicar el
-- archivo entero es idempotente.
drop function if exists public.candidatos_para_discipulado(uuid, text);

create function public.candidatos_para_discipulado(
  p_discipulado uuid,
  p_texto       text
)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  telefono_parcial text,
  similitud        real,
  ya_participa     boolean
)
language plpgsql security definer set search_path = public stable as $$
declare
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_digitos text;
begin
  if not (es_admin() or es_discipulador_de(p_discipulado)) then
    raise exception 'No autorizado para este discipulado';
  end if;

  -- Mismo mínimo que 0024: sin esto la RPC es un volcado paginado del padrón
  -- completo para cualquier discipulador.
  if length(v_texto) < 2 then
    return;
  end if;

  v_digitos := nullif(regexp_replace(v_texto, '\D', '', 'g'), '');

  -- El puntaje se calcula en la subconsulta porque el WHERE no puede
  -- referenciar el alias de salida. Tres señales, la más alta gana:
  --   * similitud pg_trgm  -> tolera tipeo, apodos y nombre/apellido al revés
  --   * subcadena (strpos) -> lo que uno espera al tipear las primeras letras;
  --     va por strpos y no por ILIKE para que un `%` tipeado no sea comodín
  --   * teléfono           -> señal fuerte, nunca autoridad (0018): en una
  --     iglesia el número suele ser el de un familiar
  return query
    select c.id, c.nombre, c.apellido, c.telefono_parcial, c.similitud, c.ya_participa
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
        ) as similitud,
        exists (
          select 1 from participaciones pa
          where pa.discipulado_id = p_discipulado
            and pa.miembro_id = m.id
            and pa.activo
        ) as ya_participa
      from miembros m
      where m.activo
    ) c
    where c.similitud >= 0.2
    -- Primero a quien se puede sumar; el que ya está queda abajo, de aviso.
    order by c.ya_participa, c.similitud desc, c.nombre, c.apellido
    limit 15;
end;
$$;

-- `public` tiene execute por default en toda función nueva: sin este revoke, la
-- clave anónima llega hasta el cuerpo y solo la frena el guard de arriba. El
-- guard es la defensa real (una sesión sin usuario tiene auth.uid() null y no
-- pasa ni es_admin() ni es_discipulador_de), pero no hay motivo para dejar la
-- puerta abierta. Mismo criterio que 0027 con `nombre_de_perfil`.
revoke execute on function public.candidatos_para_discipulado(uuid, text) from public, anon;
grant execute on function public.candidatos_para_discipulado(uuid, text) to authenticated;
