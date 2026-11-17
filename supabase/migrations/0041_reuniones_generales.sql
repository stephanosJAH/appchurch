-- =====================================================================
-- 0041_reuniones_generales.sql
-- Reunión general: participantes + resumen de lo tratado.
--
-- Por decisión de producto (2026-11-16) es "básicamente lo mismo que la
-- reunión de obreros" (0031): lista nominal de participantes contra el padrón,
-- un resumen en texto enriquecido, una reunión por fecha, admin-only. Se lee
-- toda la cabecera de 0031: las razones para no colgarla de un ministerio, de
-- `reuniones`/`reuniones_ministerio` ni de `actividades` aplican igual acá.
--
-- POR QUÉ TABLAS PROPIAS Y NO UNA COLUMNA `tipo` EN `reuniones_obreros`
-- ----------------------------------------------------------------------
-- Hoy los campos coinciden, pero son dos cosas distintas que pueden separarse:
-- el acta de obreros podría abrirse algún día al "cuerpo de obreros" (cambio
-- de la policy de select, ver docs/REUNION-OBREROS.md) y la reunión general
-- podría necesitar otra audiencia o, si algún día entra la ofrenda del culto,
-- tesorería propia (diferido #3 de ese doc). Con una sola tabla, cualquiera de
-- los dos cambios obligaría a partir la policy por `tipo`. Separadas, cada una
-- cambia sola. La UI SÍ se comparte (components/ReunionesConActa.tsx), porque
-- los campos son los mismos.
--
-- NO REGISTRA OFRENDA. Si la reunión general pasa a llevar la plata del culto
-- deja de ser "lo mismo que obreros": ver el diferido #3 de
-- docs/REUNION-OBREROS.md antes de sumar la columna.
--
-- ESPEJO PARCIAL de `registrar_reunion` (0003 + 0023),
-- `registrar_reunion_ministerio` (0025) y `registrar_reunion_obreros` (0031),
-- **sólo en la mecánica de asistencias**: inserción aditiva en el alta, "el
-- payload manda" en la edición. Una corrección a esa mecánica va en los cuatro.
-- Con 0031 el espejo es completo (mismo cuerpo, otra tabla): un cambio a uno
-- de los dos va en el otro salvo que se decida divergir a propósito.
--
-- AUTORIZACIÓN: admin, y nada más. Sólo policy de `select`; la RPC definer es
-- el único camino de escritura, así que "borrar no existe" está garantizado
-- por construcción, igual que en 0031.
--
-- BORRAR LA CUENTA (0037): a diferencia de las FK de 0001/0031, las columnas
-- de autor de estas tablas llevan `on delete set null`, así que
-- `eliminar_mi_cuenta()` no necesita un update nuevo para no fallar por FK.
--
-- Depende de 0001 (miembros, profiles), 0013 (es_admin) y 0027
-- (nombre_de_perfil).
-- =====================================================================

create table reuniones_generales (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null unique,
  tema           text,                      -- título corto del encuentro
  resumen        text,                      -- con las marcas de lib/richText.ts
  registrado_por uuid references profiles(id) on delete set null,
  editado_por    uuid references profiles(id) on delete set null,
  editado_en     timestamptz,
  created_at     timestamptz default now()
);

create table asistencias_generales (
  id         uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references reuniones_generales(id) on delete cascade,
  miembro_id uuid not null references miembros(id) on delete cascade,
  presente   boolean not null default true,
  unique (reunion_id, miembro_id)
);

create index idx_reuniones_generales_fecha on reuniones_generales (fecha desc);
create index idx_asistencias_generales_reu on asistencias_generales (reunion_id);

comment on table reuniones_generales is
  'Reunión general: resumen de lo tratado + participantes. Sin ofrenda y sin grupo dueño; ver la cabecera de 0041.';
comment on column reuniones_generales.resumen is
  'Resumen en el formato de marcas de lib/richText.ts. No es markdown completo.';
comment on column reuniones_generales.registrado_por is
  'Quién la cargó. Es auditoría, no un candado: cualquier admin puede editarla y esta columna no se pisa.';

-- =====================================================================
-- RLS — sólo lectura, y sólo admin. La escritura va por RPC.
-- =====================================================================

alter table reuniones_generales enable row level security;
create policy reugen_select on reuniones_generales for select using (es_admin());

alter table asistencias_generales enable row level security;
create policy asisgen_select on asistencias_generales for select using (es_admin());

-- =====================================================================
-- RPC transaccional: alta y edición con sus asistencias.
-- Espejo de registrar_reunion_obreros (0031); ver la cabecera.
-- =====================================================================
create or replace function public.registrar_reunion_general(
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
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_fecha is null then
    raise exception 'La fecha de la reunión es obligatoria';
  end if;

  if p_reunion_id is null then
    insert into reuniones_generales (fecha, tema, resumen, registrado_por)
    values (p_fecha, nullif(btrim(p_tema), ''), nullif(btrim(p_resumen), ''), auth.uid())
    on conflict (fecha) do update
      -- Pisar una fecha que ya tenía reunión ES una edición: queda registrada
      -- como tal y `registrado_por` sigue siendo el de la fila original.
      set tema        = excluded.tema,
          resumen     = excluded.resumen,
          editado_por = auth.uid(),
          editado_en  = now()
    returning id into v_reunion_id;
  else
    update reuniones_generales
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

  insert into asistencias_generales (reunion_id, miembro_id, presente)
  select v_reunion_id,
         (a->>'miembro_id')::uuid,
         coalesce((a->>'presente')::boolean, true)
  from jsonb_array_elements(coalesce(p_asistencias, '[]'::jsonb)) a
  on conflict (reunion_id, miembro_id) do update
    set presente = excluded.presente;

  -- Sólo al editar: el payload manda, lo que no está se va.
  if p_reunion_id is not null then
    delete from asistencias_generales asi
     where asi.reunion_id = v_reunion_id
       and not exists (
         select 1 from jsonb_array_elements(coalesce(p_asistencias, '[]'::jsonb)) a
          where (a->>'miembro_id')::uuid = asi.miembro_id
       );
  end if;

  return v_reunion_id;

exception
  when unique_violation then
    raise exception 'Ya hay una reunión general registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion_general(date, text, text, jsonb, uuid) is
  'Alta o edición transaccional de la reunión general con sus asistencias. Único camino de escritura. Espejo de registrar_reunion_obreros (0031).';

-- =====================================================================
-- Listado para la pantalla de administración. Definer sólo para poder
-- llamar a nombre_de_perfil (0027), que no tiene execute para authenticated.
-- =====================================================================
create or replace function public.reuniones_generales_listado()
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
      from reuniones_generales r
      left join asistencias_generales a on a.reunion_id = r.id
     group by r.id
     order by r.fecha desc;
end;
$function$;

comment on function public.reuniones_generales_listado() is
  'Historial de reuniones generales con el conteo de presentes y los nombres de quien registró/editó.';

revoke execute on function public.registrar_reunion_general(date, text, text, jsonb, uuid) from public, anon;
revoke execute on function public.reuniones_generales_listado() from public, anon;
grant execute on function public.registrar_reunion_general(date, text, text, jsonb, uuid) to authenticated;
grant execute on function public.reuniones_generales_listado() to authenticated;
