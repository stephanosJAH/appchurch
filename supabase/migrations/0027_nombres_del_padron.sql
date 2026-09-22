-- =====================================================================
-- 0027_nombres_del_padron.sql
-- El nombre que se muestra sale del padrón, no del registro.
--
-- `profiles.nombre_completo` es lo que la persona tipeó al crearse la cuenta:
-- el registro no pide un nombre "bueno", pide algo que la identifique (ver
-- lib/authIdentity.ts). El nombre que mantiene la iglesia vive en su ficha del
-- padrón, enlazada desde 0018 por `profiles.miembro_id`.
--
-- Donde el nombre lo resuelve el cliente ya se arregló con un embed a
-- `miembros`. Acá se arreglan las cuatro superficies donde lo arma SQL y el
-- front no puede tocar:
--   * vista `ministerios_lideres` (0024) -> quiénes lideran cada ministerio
--   * `mis_ministerios()`         (0024) -> el array `lideres`
--   * `mi_grupo()`                (0019) -> el `discipulador` del grupo
--   * `anuncios_visibles()`       (0026) -> la firma del anuncio
--
-- No cambia QUÉ devuelve cada una ni a quién: mismas columnas, mismos filtros,
-- mismos permisos. Quien ya veía el nombre de registro pasa a ver el del padrón
-- (nombre + apellido y nada más — ni teléfono, ni fecha de nacimiento, ni
-- email). Las cuentas sin ficha enlazada (las previas a 0018) siguen mostrando
-- `nombre_completo` como fallback.
--
-- Depende de 0018 (profiles.miembro_id), 0019, 0024 y 0026.
-- =====================================================================

-- ===== El nombre de una cuenta, resuelto contra el padrón =====
-- Una sola definición de la regla para las tres RPC de abajo; el cliente tiene
-- su espejo en `nombreDePerfil` (lib/queries/profiles.ts).
--
-- Sin `security definer` y sin grant a propósito: solo la llaman las RPC de este
-- archivo, que son definer y por lo tanto corren como su dueño — ahí la RLS de
-- `miembros` (0014) no aplica. Si alguien la llamara desde el cliente correría
-- con SU rol: no abre una superficie nueva. (La vista de líderes no la usa; ver
-- la nota ahí abajo.)
create or replace function public.nombre_de_perfil(p_profile_id uuid)
returns text language sql stable set search_path = public as $$
  select coalesce(
           nullif(btrim(m.nombre || ' ' || coalesce(m.apellido, '')), ''),
           p.nombre_completo
         )
  from public.profiles p
  left join public.miembros m on m.id = p.miembro_id
  where p.id = p_profile_id;
$$;

revoke execute on function public.nombre_de_perfil(uuid) from public, anon, authenticated;

-- ===== Vista de líderes de ministerio (0024), con el nombre del padrón =====
-- Se recrea entera porque un `create or replace view` no puede cambiar la
-- forma de una columna existente. Mismas columnas, mismo gate por rol, mismos
-- grants que en 0024.
--
-- Acá la regla va repetida en vez de llamar a `nombre_de_perfil`: una vista no
-- cambia el current_user (solo resuelve las TABLAS que referencia con los
-- permisos de su dueño), así que la función correría con el rol de quien
-- consulta — sin execute y con la RLS de `miembros` encima. Dentro de las RPC
-- de abajo sí se puede: `security definer` sí cambia el current_user.
drop view if exists public.ministerios_lideres;
create view public.ministerios_lideres with (security_invoker = false) as
  select ml.ministerio_id, ml.profile_id,
         coalesce(
           nullif(btrim(m.nombre || ' ' || coalesce(m.apellido, '')), ''),
           p.nombre_completo
         ) as nombre_completo
  from public.ministerio_lideres ml
  join public.profiles p on p.id = ml.profile_id
  left join public.miembros m on m.id = p.miembro_id
  where public.es_miembro_activo();

revoke all on public.ministerios_lideres from anon;
grant select on public.ministerios_lideres to authenticated;

-- ===== mis_ministerios() (0024): el array `lideres` =====
-- Idéntica a la de 0024 salvo el nombre resuelto y el `order by` del array, que
-- ahora ordena por ese mismo nombre y no por el de registro.
create or replace function public.mis_ministerios()
returns table (
  id          uuid,
  nombre      text,
  descripcion text,
  icono       text,
  soy_lider   boolean,
  lideres     text[],
  integrantes integer
)
language sql security definer set search_path = public stable as $$
  select
    m.id, m.nombre, m.descripcion, m.icono,
    es_lider_de_ministerio(m.id) as soy_lider,
    -- array(subquery) devuelve '{}' si no hay líderes, nunca null.
    array(
      select coalesce(nombre_de_perfil(l.profile_id), 'Sin nombre')
      from ministerio_lideres l
      where l.ministerio_id = m.id
      order by 1
    ) as lideres,
    case when es_lider_de_ministerio(m.id) then (
      select count(*)::int from ministerio_miembros mm
      where mm.ministerio_id = m.id and mm.activo
    ) end as integrantes
  from ministerios m
  where es_miembro_activo()
    and m.activo
    and (es_lider_de_ministerio(m.id) or participo_del_ministerio(m.id))
  order by m.nombre;
$$;

grant execute on function public.mis_ministerios() to authenticated;

-- ===== mi_grupo() (0019): el nombre del discipulador =====
-- Idéntica a la de 0019 salvo el nombre: el join a `profiles` lo hace ahora
-- `nombre_de_perfil`, que devuelve null si el grupo no tiene líder asignado
-- (igual que el left join que reemplaza).
create or replace function public.mi_grupo()
returns table (
  id                 uuid,
  nombre             text,
  descripcion_etaria text,
  sexo               sexo_discipulado,
  modalidad          modalidad,
  dia_semana         smallint,
  hora_inicio        time,
  hora_fin           time,
  ubicacion          text,
  enlace_virtual     text,
  discipulador       text
)
language sql security definer set search_path = public stable as $$
  select d.id, d.nombre, d.descripcion_etaria, d.sexo, d.modalidad,
         d.dia_semana, d.hora_inicio, d.hora_fin, d.ubicacion,
         d.enlace_virtual, nombre_de_perfil(d.discipulador_id)
  from participaciones pa
  join discipulados d on d.id = pa.discipulado_id
  where public.es_miembro_activo()
    and pa.activo
    and d.activo
    and pa.miembro_id = (select p.miembro_id from profiles p where p.id = auth.uid())
  order by d.dia_semana, d.hora_inicio;
$$;

grant execute on function public.mi_grupo() to authenticated;

-- ===== anuncios_visibles() (0026): la firma del anuncio =====
-- Idéntica a la de 0026 salvo el nombre del autor. `autor_id` se sigue
-- devolviendo tal cual: es quién lo escribió, no un dato de permiso.
create or replace function public.anuncios_visibles(
  p_incluir_vencidos boolean default false
)
returns table (
  id                 uuid,
  ministerio_id      uuid,
  ministerio_nombre  text,
  titulo             text,
  cuerpo             text,
  autor_id           uuid,
  autor              text,
  fijado             boolean,
  vence_el           date,
  created_at         timestamptz
)
language sql security definer set search_path = public stable as $$
  select a.id, a.ministerio_id, m.nombre, a.titulo, a.cuerpo,
         a.autor_id, nombre_de_perfil(a.autor_id), a.fijado, a.vence_el, a.created_at
  from anuncios a
  left join ministerios m on m.id = a.ministerio_id
  where es_miembro_activo()
    and (coalesce(p_incluir_vencidos, false) or a.vence_el is null or a.vence_el >= current_date)
    and (
      case
        when a.ministerio_id is null then true
        else es_admin()
             or es_lider_de_ministerio(a.ministerio_id)
             or participo_del_ministerio(a.ministerio_id)
      end
    )
  order by a.fijado desc, a.created_at desc;
$$;

grant execute on function public.anuncios_visibles(boolean) to authenticated;
