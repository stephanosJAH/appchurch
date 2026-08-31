-- =====================================================================
-- 0025_reuniones_ministerio.sql
-- Reuniones de ministerio, con asistencia y ofrenda (Fase B de
-- docs/MINISTERIOS.md).
--
-- ⚠ ESPEJO DE `registrar_reunion` (0003 + 0023). **Decisión de producto
-- (2026-08-19): la contabilidad va separada en la base** — las ofrendas de
-- ministerio no comparten tabla con las de discipulado. La alternativa
-- evaluada era una `reuniones` polimórfica (`discipulado_id` / `ministerio_id`
-- con un check de arco exclusivo), que daba el desglose por origen gratis y
-- una sola implementación del RPC; se eligió la separación física porque son
-- dos libros distintos y no se mezclan por accidente.
--
-- Lo que eso cuesta: `asistencias` cuelga de `reuniones`, así que separar una
-- obliga a separar la otra, y con ella el RPC transaccional. **El SQL queda
-- duplicado: cualquier corrección a `registrar_reunion` va sí o sí también en
-- `registrar_reunion_ministerio`, y al revés.** La UI en cambio NO se duplica
-- (app/reunion/nueva.tsx y app/reunion/[id].tsx se comparten y ramifican por
-- un parámetro `origen`); lo único que cambia allá es qué hook se llama.
--
-- Diferencias deliberadas con la versión de discipulado:
--   * Sin `material_url`: el bucket `materiales` todavía no lo usa ninguna
--     pantalla, ni siquiera en discipulados. Se suma cuando haga falta.
--   * La autorización es pertenencia al conjunto de líderes
--     (`es_lider_de_ministerio`), no una igualdad contra un dueño único. Todo
--     líder puede editar la reunión que cargó otro; `registrado_por` guarda al
--     autor original y NO se pisa al editar (misma decisión que 0023).
--
-- Depende de 0024 (ministerios, helpers) y 0001 (enum `modalidad`).
-- =====================================================================

create table reuniones_ministerio (
  id              uuid primary key default gen_random_uuid(),
  ministerio_id   uuid not null references ministerios(id) on delete cascade,
  fecha           date not null,
  tema            text,
  modalidad_usada modalidad,
  ofrenda_total   numeric(12,2) default 0,
  notas           text,
  registrado_por  uuid references profiles(id),
  created_at      timestamptz default now(),
  unique (ministerio_id, fecha)
);

create table asistencias_ministerio (
  id         uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references reuniones_ministerio(id) on delete cascade,
  miembro_id uuid not null references miembros(id) on delete cascade,
  presente   boolean not null default true,
  modalidad  modalidad,
  unique (reunion_id, miembro_id)
);

create index idx_reuniones_ministerio_min   on reuniones_ministerio (ministerio_id);
create index idx_reuniones_ministerio_fecha on reuniones_ministerio (fecha);
create index idx_asistencias_ministerio_reu on asistencias_ministerio (reunion_id);

comment on column reuniones_ministerio.registrado_por is
  'Quién cargó la reunión. Es un dato, no un candado: cualquier líder del ministerio puede editarla, y esta columna no se pisa al hacerlo.';

-- =====================================================================
-- RLS — espejo de `reu_all` / `asis_all` (0002), con el conjunto de líderes
-- en lugar de la igualdad contra `discipulador_id`.
-- =====================================================================

alter table reuniones_ministerio enable row level security;
create policy reumin_all on reuniones_ministerio for all
  using (es_admin() or es_lider_de_ministerio(ministerio_id))
  with check (es_admin() or es_lider_de_ministerio(ministerio_id));

-- Las asistencias heredan el permiso de la reunión asociada.
alter table asistencias_ministerio enable row level security;
create policy asismin_all on asistencias_ministerio for all
  using (
    es_admin() or es_lider_de_ministerio(
      (select ministerio_id from reuniones_ministerio where id = reunion_id)
    )
  )
  with check (
    es_admin() or es_lider_de_ministerio(
      (select ministerio_id from reuniones_ministerio where id = reunion_id)
    )
  );

-- =====================================================================
-- RPC transaccional: alta y edición de una reunión con sus asistencias.
-- Espejo de `registrar_reunion` (0023) — leer la advertencia de la cabecera.
-- =====================================================================

-- p_asistencias: jsonb array de { miembro_id, presente, modalidad }
--   * p_reunion_id null -> alta, con upsert por (ministerio_id, fecha) e
--     inserción ADITIVA de asistencias: quien registra una fecha nueva nunca
--     está pidiendo borrar a nadie.
--   * p_reunion_id uuid -> edición de ESA reunión, donde la fecha es un campo
--     más y el payload de asistencias es el ESTADO FINAL (lo que no viene se
--     borra, porque sacar a alguien de la lista de presentes es justamente una
--     de las correcciones que se piden).
--
-- Al editar, el ministerio sale de la reunión GUARDADA, no del parámetro: si
-- no, alcanzaría con mandar el id de una reunión ajena junto al id de un
-- ministerio propio para pasar el control. `p_ministerio_id` se ignora en ese
-- caso — mover una reunión de ministerio no es una corrección de tipeo, y el
-- historial de asistencias no tendría sentido en otro roster.
create or replace function public.registrar_reunion_ministerio(
  p_ministerio_id uuid,
  p_fecha         date,
  p_tema          text,
  p_modalidad     modalidad,
  p_ofrenda       numeric,
  p_notas         text,
  p_asistencias   jsonb,
  p_reunion_id    uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id    uuid;
  v_ministerio_id uuid;
begin
  if p_reunion_id is null then
    v_ministerio_id := p_ministerio_id;
  else
    select ministerio_id into v_ministerio_id
    from reuniones_ministerio where id = p_reunion_id;
    if v_ministerio_id is null then
      raise exception 'La reunión que querés editar no existe';
    end if;
  end if;

  -- Pertenencia al conjunto, no "¿sos el que la cargó?".
  if not (es_admin() or es_lider_de_ministerio(v_ministerio_id)) then
    raise exception 'No autorizado para este ministerio';
  end if;

  if p_reunion_id is null then
    insert into reuniones_ministerio (ministerio_id, fecha, tema, modalidad_usada,
                                      ofrenda_total, notas, registrado_por)
    values (p_ministerio_id, p_fecha, p_tema, p_modalidad,
            coalesce(p_ofrenda, 0), p_notas, auth.uid())
    on conflict (ministerio_id, fecha) do update
      set tema = excluded.tema,
          modalidad_usada = excluded.modalidad_usada,
          ofrenda_total = excluded.ofrenda_total,
          notas = excluded.notas
    returning id into v_reunion_id;
  else
    -- `registrado_por` no se toca: es quien la cargó, no quien la corrigió.
    update reuniones_ministerio
       set fecha           = p_fecha,
           tema            = p_tema,
           modalidad_usada = p_modalidad,
           ofrenda_total   = coalesce(p_ofrenda, 0),
           notas           = p_notas
     where id = p_reunion_id
    returning id into v_reunion_id;
  end if;

  insert into asistencias_ministerio (reunion_id, miembro_id, presente, modalidad)
  select v_reunion_id,
         (a->>'miembro_id')::uuid,
         coalesce((a->>'presente')::boolean, true),
         (a->>'modalidad')::modalidad
  from jsonb_array_elements(p_asistencias) a
  on conflict (reunion_id, miembro_id) do update
    set presente = excluded.presente,
        modalidad = excluded.modalidad;

  -- Solo al editar: el payload manda, lo que no está se va.
  if p_reunion_id is not null then
    delete from asistencias_ministerio asi
     where asi.reunion_id = v_reunion_id
       and not exists (
         select 1 from jsonb_array_elements(p_asistencias) a
          where (a->>'miembro_id')::uuid = asi.miembro_id
       );
  end if;

  return v_reunion_id;

exception
  -- Editar la fecha hacia una que ya tiene reunión en ese ministerio choca
  -- contra unique (ministerio_id, fecha). El mensaje crudo de Postgres no le
  -- dice nada a quien está cargando la asistencia.
  when unique_violation then
    raise exception 'Ese ministerio ya tiene una reunión registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion_ministerio(uuid, date, text, modalidad, numeric, text, jsonb, uuid) is
  'Alta o edición transaccional de una reunión de ministerio con sus asistencias. ESPEJO de registrar_reunion: toda corrección va en las dos. Autoriza por pertenencia a ministerio_lideres, nunca por registrado_por.';

-- ===== Historial visto por un participante =====
-- Espejo de `reuniones_de_mi_grupo` (0019). Solo fecha, tema y los presentes:
-- `ofrenda_total` y `notas` son datos de gestión y el corte va acá, en el
-- `returns table`, no en la UI.
-- Acepta también al líder: llamarla no le da menos permiso del que ya tiene
-- (lee las tablas directo por RLS), y evita que la pantalla compartida tenga
-- que elegir camino antes de saber quién mira.
create or replace function public.reuniones_de_mi_ministerio(p_ministerio uuid)
returns table (
  id            uuid,
  fecha         date,
  tema          text,
  participantes text[]
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not es_miembro_activo() then
    raise exception 'Tu cuenta no está habilitada';
  end if;

  if not (es_admin() or es_lider_de_ministerio(p_ministerio)
          or participo_del_ministerio(p_ministerio)) then
    raise exception 'No participás de este ministerio';
  end if;

  return query
    select r.id, r.fecha, r.tema,
           -- array(subquery) devuelve '{}' si no hay presentes, nunca null.
           array(
             select btrim(m.nombre || ' ' || coalesce(m.apellido, ''))
             from asistencias_ministerio a
             join miembros m on m.id = a.miembro_id
             where a.reunion_id = r.id and a.presente
             order by m.nombre, m.apellido
           ) as participantes
    from reuniones_ministerio r
    where r.ministerio_id = p_ministerio
    order by r.fecha desc;
end;
$$;

grant execute on function public.registrar_reunion_ministerio(uuid, date, text, modalidad, numeric, text, jsonb, uuid) to authenticated;
grant execute on function public.reuniones_de_mi_ministerio(uuid) to authenticated;
