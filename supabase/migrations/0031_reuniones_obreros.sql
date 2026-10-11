-- =====================================================================
-- 0031_reuniones_obreros.sql
-- Reunión de obreros: participantes + acta de lo tratado.
--
-- POR QUÉ ES UNA ENTIDAD PROPIA Y NO CUELGA DE NADA QUE YA EXISTA
-- ---------------------------------------------------------------
-- La reunión de obreros trata temas de los ministerios y sus actividades,
-- organización de limpiezas y trabajo general de la iglesia. Las tres
-- alternativas que había sobre la mesa se descartaron a propósito:
--
--   * `ministerios` — haría falta un "ministerio Obreros", y un ministerio es
--     un ÁREA de la iglesia (jóvenes, alabanza), no el cuerpo que la dirige.
--     Esa fila falsa arrastraría `ministerio_lideres`, `ministerio_miembros`,
--     `mis_ministerios()` y las pantallas de ministerio, todas mintiendo.
--   * `reuniones` / `reuniones_ministerio` — las dos exigen un grupo dueño
--     (`discipulado_id` y `ministerio_id` son `not null`). No hay dónde
--     ponerla sin inventar el dueño.
--   * `actividades` — modela recurrencia semanal (`dias_semana`) y es pública
--     (feed y calendario de todos). El acta de obreros no es agenda pública.
--
-- NO ES UN TERCER LIBRO CONTABLE: no registra ofrenda. Lo que justificó
-- separar físicamente los libros de discipulado y ministerio (decisión del
-- 2026-08-19, ver 0025) fue la contabilidad, y acá no hay plata. Por eso esta
-- tabla NO copia `ofrenda_total` ni `modalidad_usada`.
--
-- ESPEJO PARCIAL de `registrar_reunion` (0003 + 0023) y
-- `registrar_reunion_ministerio` (0025), **sólo en la mecánica de
-- asistencias**: inserción aditiva en el alta, "el payload manda" en la
-- edición. Una corrección a esa mecánica en cualquiera de los tres va en los
-- tres. El resto del cuerpo no es espejo y no debe sincronizarse.
--
-- AUTORIZACIÓN: admin, y nada más. Se entra desde la sección Administración
-- del Perfil. Es deliberadamente más cerrado que los otros dos libros y evita
-- la pregunta abierta de "quiénes son el cuerpo de obreros" — el día que los
-- obreros tengan que leer el acta, se cambia la policy de `select` (y sólo
-- esa) por un helper de pertenencia. Las tablas NO tienen policy de
-- insert/update/delete: la RPC definer es el único camino de escritura, así
-- que "borrar no existe" (docs/ROLES-Y-PERMISOS.md) queda garantizado por
-- construcción y no por convención — a diferencia de `reu_all` (0002) y
-- `reumin_all` (0025), que eran `for all` y sí permitían DELETE por REST.
-- (Corregido después en 0032: los dos libros viejos se alinearon a este
-- criterio y hoy también son sólo de lectura.)
--
-- La asistencia va contra `miembros` (el padrón) y no contra `profiles`, por
-- dos razones: un obrero que no usa la app igual se sienta en la reunión y
-- tiene que poder marcarse presente, y así `lib/asistencia.ts` y la grilla del
-- roster sirven sin adaptar nada.
--
-- Depende de 0001 (miembros, profiles), 0013 (es_admin) y 0027
-- (nombre_de_perfil).
-- =====================================================================

create table reuniones_obreros (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null unique,
  tema           text,                      -- título corto del encuentro
  resumen        text,                      -- acta, con las marcas de lib/richText.ts
  registrado_por uuid references profiles(id),
  editado_por    uuid references profiles(id),
  editado_en     timestamptz,
  created_at     timestamptz default now()
);

create table asistencias_obreros (
  id         uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references reuniones_obreros(id) on delete cascade,
  miembro_id uuid not null references miembros(id) on delete cascade,
  presente   boolean not null default true,
  unique (reunion_id, miembro_id)
);

create index idx_reuniones_obreros_fecha on reuniones_obreros (fecha desc);
create index idx_asistencias_obreros_reu on asistencias_obreros (reunion_id);

comment on table reuniones_obreros is
  'Reunión del cuerpo de obreros: acta de lo tratado + participantes. Sin ofrenda y sin grupo dueño; ver la cabecera de 0031.';
comment on column reuniones_obreros.resumen is
  'Acta en el formato de marcas de lib/richText.ts (el mismo de las descripciones, 0029/0030). No es markdown completo.';
comment on column reuniones_obreros.registrado_por is
  'Quién la cargó. Es auditoría, no un candado: cualquier admin puede editarla y esta columna no se pisa.';

-- =====================================================================
-- RLS — sólo lectura, y sólo admin. La escritura va por RPC (ver cabecera).
-- =====================================================================

alter table reuniones_obreros enable row level security;
create policy reuobr_select on reuniones_obreros for select using (es_admin());

alter table asistencias_obreros enable row level security;
create policy asisobr_select on asistencias_obreros for select using (es_admin());

-- =====================================================================
-- RPC transaccional: alta y edición de la reunión con sus asistencias.
-- =====================================================================
-- p_asistencias: jsonb array de { miembro_id, presente }
--   * p_reunion_id null -> alta, con upsert por `fecha` e inserción ADITIVA de
--     asistencias: quien registra una fecha nueva nunca pide borrar a nadie.
--   * p_reunion_id uuid -> edición de ESA reunión; el payload de asistencias
--     es el ESTADO FINAL (lo que no viene se borra, porque sacar a alguien de
--     la lista de presentes es justamente una de las correcciones que se
--     piden).
--
-- `modalidad` no existe acá: si algún día la reunión se hace virtual se suma
-- la columna, es barato. No se copió "porque los otros la tienen".
create or replace function public.registrar_reunion_obreros(
  p_fecha       date,
  p_tema        text,
  p_resumen     text,
  p_asistencias jsonb,
  p_reunion_id  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id uuid;
begin
  -- Primera línea: el gate. No hay dueño contra el que autorizar, así que el
  -- chequeo es idéntico para el alta y para cualquier reunión existente.
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_fecha is null then
    raise exception 'La fecha de la reunión es obligatoria';
  end if;

  if p_reunion_id is null then
    insert into reuniones_obreros (fecha, tema, resumen, registrado_por)
    values (p_fecha, nullif(btrim(p_tema), ''), nullif(btrim(p_resumen), ''), auth.uid())
    on conflict (fecha) do update
      -- Pisar una fecha que ya tenía reunión ES una edición, aunque se haya
      -- entrado por el alta: queda registrada como tal. `registrado_por`
      -- sigue siendo el de la fila original.
      set tema        = excluded.tema,
          resumen     = excluded.resumen,
          editado_por = auth.uid(),
          editado_en  = now()
    returning id into v_reunion_id;
  else
    -- `registrado_por` no se toca: es quien la cargó, no quien la corrigió.
    -- `editado_por`/`editado_en` sí, porque el acta es un texto largo que
    -- varios admins pueden retocar y "quién la tocó última" es el mínimo.
    update reuniones_obreros
       set fecha       = p_fecha,
           tema        = nullif(btrim(p_tema), ''),
           resumen     = nullif(btrim(p_resumen), ''),
           editado_por = auth.uid(),
           editado_en  = now()
     where id = p_reunion_id
    returning id into v_reunion_id;

    if v_reunion_id is null then
      raise exception 'La reunión que querés editar no existe';
    end if;
  end if;

  insert into asistencias_obreros (reunion_id, miembro_id, presente)
  select v_reunion_id,
         (a->>'miembro_id')::uuid,
         coalesce((a->>'presente')::boolean, true)
  from jsonb_array_elements(coalesce(p_asistencias, '[]'::jsonb)) a
  on conflict (reunion_id, miembro_id) do update
    set presente = excluded.presente;

  -- Sólo al editar: el payload manda, lo que no está se va.
  if p_reunion_id is not null then
    delete from asistencias_obreros asi
     where asi.reunion_id = v_reunion_id
       and not exists (
         select 1 from jsonb_array_elements(coalesce(p_asistencias, '[]'::jsonb)) a
          where (a->>'miembro_id')::uuid = asi.miembro_id
       );
  end if;

  return v_reunion_id;

exception
  -- Mover la fecha hacia una que ya tiene reunión choca contra unique (fecha).
  -- El mensaje crudo de Postgres no le dice nada a quien está cargando.
  when unique_violation then
    raise exception 'Ya hay una reunión de obreros registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion_obreros(date, text, text, jsonb, uuid) is
  'Alta o edición transaccional de la reunión de obreros con sus asistencias. Único camino de escritura (las tablas sólo tienen policy de select). Espejo PARCIAL de registrar_reunion/registrar_reunion_ministerio: sólo la mecánica de asistencias.';

-- =====================================================================
-- Listado para la pantalla de administración.
-- Definer porque `nombre_de_perfil` (0027) no tiene execute para
-- `authenticated`: sin esto la UI mostraría uuids en "registró / editó".
-- =====================================================================
create or replace function public.reuniones_obreros_listado()
returns table (
  id                     uuid,
  fecha                  date,
  tema                   text,
  resumen                text,
  presentes              integer,
  total_registrados      integer,
  registrado_por_nombre  text,
  editado_por_nombre     text,
  editado_en             timestamptz
)
language plpgsql security definer set search_path = public as $function$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
    select r.id,
           r.fecha,
           r.tema,
           r.resumen,
           count(a.id) filter (where a.presente)::integer as presentes,
           count(a.id)::integer                           as total_registrados,
           nombre_de_perfil(r.registrado_por),
           nombre_de_perfil(r.editado_por),
           r.editado_en
      from reuniones_obreros r
      left join asistencias_obreros a on a.reunion_id = r.id
     group by r.id
     order by r.fecha desc;
end;
$function$;

comment on function public.reuniones_obreros_listado() is
  'Historial de reuniones de obreros con el conteo de presentes y los nombres de quien registró/editó. Definer sólo para poder llamar a nombre_de_perfil.';

grant execute on function public.registrar_reunion_obreros(date, text, text, jsonb, uuid) to authenticated;
grant execute on function public.reuniones_obreros_listado() to authenticated;
