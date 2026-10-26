-- =====================================================================
-- 0036_ofrenda_presencial_virtual.sql
-- La ofrenda de una reunión se carga separada en presencial y virtual.
--
-- Contexto: una reunión puede ser presencial, virtual o de las dos
-- (`modalidad_usada = 'ambos'`, existe desde 0001), y la ofrenda llega por los
-- dos caminos: en mano y por transferencia. Hasta acá se cargaba un solo
-- número (`ofrenda_total`) y no había forma de saber cuánto entró por cada uno.
--
-- QUÉ CAMBIA
-- ----------
-- 1. `ofrenda_presencial` y `ofrenda_virtual` en los DOS libros (`reuniones` y
--    `reuniones_ministerio`, separados por decisión de producto — ver 0025).
-- 2. `ofrenda_total` se queda y pasa a ser la suma de las dos. Todo lo que ya
--    lo lee (desglose de ofrendas, resúmenes del mes, perfil) sigue andando
--    sin tocarlo. Un check lo garantiza: no puede quedar desincronizado.
-- 3. Las dos RPC suman `p_ofrenda_presencial` y `p_ofrenda_virtual` (con
--    default null) y dejan de usar `p_ofrenda` cuando vienen. `p_ofrenda` se
--    conserva para las apps instaladas con el JS viejo: mandan solo el total,
--    y eso se guarda como antes, sin desglose.
--
-- Las reuniones ya registradas quedan con las dos columnas en null: no se sabe
-- cómo se repartió esa plata, y repartirla a ojo sería inventar contabilidad.
-- Null = "cargada antes del desglose"; el total sigue siendo el de siempre.
--
-- `registrar_reunion` y `registrar_reunion_ministerio` son ESPEJOS: el cambio
-- va idéntico en las dos. `registrar_reunion_obreros` (0031) no se toca —
-- esa reunión no tiene ofrenda.
--
-- Depende de 0001, 0023 (firma actual de registrar_reunion) y 0025 (libro de
-- ministerios y su RPC).
-- =====================================================================

-- ===== Columnas =====

alter table reuniones
  add column if not exists ofrenda_presencial numeric(12,2),
  add column if not exists ofrenda_virtual    numeric(12,2);

alter table reuniones_ministerio
  add column if not exists ofrenda_presencial numeric(12,2),
  add column if not exists ofrenda_virtual    numeric(12,2);

-- O no hay desglose (las dos null, reuniones viejas o apps viejas), o lo hay
-- completo, sin negativos, y el total es exactamente la suma.
alter table reuniones drop constraint if exists reuniones_ofrenda_desglose;
alter table reuniones add constraint reuniones_ofrenda_desglose check (
  (ofrenda_presencial is null and ofrenda_virtual is null)
  or (ofrenda_presencial >= 0 and ofrenda_virtual >= 0
      and ofrenda_total = ofrenda_presencial + ofrenda_virtual)
);

alter table reuniones_ministerio drop constraint if exists reuniones_ministerio_ofrenda_desglose;
alter table reuniones_ministerio add constraint reuniones_ministerio_ofrenda_desglose check (
  (ofrenda_presencial is null and ofrenda_virtual is null)
  or (ofrenda_presencial >= 0 and ofrenda_virtual >= 0
      and ofrenda_total = ofrenda_presencial + ofrenda_virtual)
);

comment on column reuniones.ofrenda_total is
  'Ofrenda de la reunión. Desde 0036 es ofrenda_presencial + ofrenda_virtual cuando hay desglose (check reuniones_ofrenda_desglose).';
comment on column reuniones_ministerio.ofrenda_total is
  'Ofrenda de la reunión. Desde 0036 es ofrenda_presencial + ofrenda_virtual cuando hay desglose (check reuniones_ministerio_ofrenda_desglose).';

-- ===== registrar_reunion (discipulados) =====
-- Cambiar la firma obliga a dropear la de 0023: si no, quedan dos overloads y
-- PostgREST no sabe cuál elegir.
drop function if exists public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb, uuid);

create or replace function public.registrar_reunion(
  p_discipulado_id     uuid,
  p_fecha              date,
  p_tema               text,
  p_material_url       text,
  p_modalidad          modalidad,
  p_ofrenda            numeric,
  p_notas              text,
  p_asistencias        jsonb,
  p_reunion_id         uuid    default null,
  p_ofrenda_presencial numeric default null,
  p_ofrenda_virtual    numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id uuid;
  v_grupo_id   uuid;
  v_presencial numeric(12,2);
  v_virtual    numeric(12,2);
  v_total      numeric(12,2);
begin
  if p_reunion_id is null then
    v_grupo_id := p_discipulado_id;
  else
    -- El grupo sale de la reunión guardada: es lo único que la RPC puede
    -- creerle a alguien que dice ser el dueño de esa reunión.
    select discipulado_id into v_grupo_id from reuniones where id = p_reunion_id;
    if v_grupo_id is null then
      raise exception 'La reunión que querés editar no existe';
    end if;
  end if;

  if not (es_admin() or es_discipulador_de(v_grupo_id)) then
    raise exception 'No autorizado para este discipulado';
  end if;

  -- Con desglose (app nueva): el total es la suma. Sin desglose (app vieja):
  -- se guarda el total que mandó, como antes de 0036.
  if p_ofrenda_presencial is not null or p_ofrenda_virtual is not null then
    v_presencial := coalesce(p_ofrenda_presencial, 0);
    v_virtual    := coalesce(p_ofrenda_virtual, 0);
    if v_presencial < 0 or v_virtual < 0 then
      raise exception 'La ofrenda no puede ser negativa';
    end if;
    v_total := v_presencial + v_virtual;
  else
    v_total := coalesce(p_ofrenda, 0);
  end if;

  if p_reunion_id is null then
    insert into reuniones (discipulado_id, fecha, tema, material_url, modalidad_usada,
                           ofrenda_total, ofrenda_presencial, ofrenda_virtual,
                           notas, registrado_por)
    values (p_discipulado_id, p_fecha, p_tema, p_material_url, p_modalidad,
            v_total, v_presencial, v_virtual,
            p_notas, auth.uid())
    on conflict (discipulado_id, fecha) do update
      set tema = excluded.tema,
          material_url = excluded.material_url,
          modalidad_usada = excluded.modalidad_usada,
          ofrenda_total = excluded.ofrenda_total,
          ofrenda_presencial = excluded.ofrenda_presencial,
          ofrenda_virtual = excluded.ofrenda_virtual,
          notas = excluded.notas
    returning id into v_reunion_id;
  else
    -- `registrado_por` no se toca: es quien la cargó, no quien la corrigió.
    update reuniones
       set fecha              = p_fecha,
           tema               = p_tema,
           material_url       = p_material_url,
           modalidad_usada    = p_modalidad,
           ofrenda_total      = v_total,
           ofrenda_presencial = v_presencial,
           ofrenda_virtual    = v_virtual,
           notas              = p_notas
     where id = p_reunion_id
    returning id into v_reunion_id;
  end if;

  insert into asistencias (reunion_id, miembro_id, presente, modalidad)
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
    delete from asistencias asi
     where asi.reunion_id = v_reunion_id
       and not exists (
         select 1 from jsonb_array_elements(p_asistencias) a
          where (a->>'miembro_id')::uuid = asi.miembro_id
       );
  end if;

  return v_reunion_id;

exception
  -- Editar la fecha hacia una que ya tiene reunión en ese grupo choca contra
  -- unique (discipulado_id, fecha) de 0001.
  when unique_violation then
    raise exception 'Ese grupo ya tiene una reunión registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb, uuid, numeric, numeric) is
  'Alta o edición transaccional de una reunión con sus asistencias. ESPEJO de registrar_reunion_ministerio: toda corrección va en las dos. Con p_ofrenda_presencial/p_ofrenda_virtual el total es la suma (0036); sin ellos se guarda p_ofrenda sin desglose. Autoriza contra el grupo de la reunión: es_admin() o es_discipulador_de().';

grant execute on function public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb, uuid, numeric, numeric) to authenticated;

-- ===== registrar_reunion_ministerio (espejo) =====
drop function if exists public.registrar_reunion_ministerio(uuid, date, text, modalidad, numeric, text, jsonb, uuid);

create or replace function public.registrar_reunion_ministerio(
  p_ministerio_id      uuid,
  p_fecha              date,
  p_tema               text,
  p_modalidad          modalidad,
  p_ofrenda            numeric,
  p_notas              text,
  p_asistencias        jsonb,
  p_reunion_id         uuid    default null,
  p_ofrenda_presencial numeric default null,
  p_ofrenda_virtual    numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id    uuid;
  v_ministerio_id uuid;
  v_presencial    numeric(12,2);
  v_virtual       numeric(12,2);
  v_total         numeric(12,2);
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

  -- Con desglose (app nueva): el total es la suma. Sin desglose (app vieja):
  -- se guarda el total que mandó, como antes de 0036.
  if p_ofrenda_presencial is not null or p_ofrenda_virtual is not null then
    v_presencial := coalesce(p_ofrenda_presencial, 0);
    v_virtual    := coalesce(p_ofrenda_virtual, 0);
    if v_presencial < 0 or v_virtual < 0 then
      raise exception 'La ofrenda no puede ser negativa';
    end if;
    v_total := v_presencial + v_virtual;
  else
    v_total := coalesce(p_ofrenda, 0);
  end if;

  if p_reunion_id is null then
    insert into reuniones_ministerio (ministerio_id, fecha, tema, modalidad_usada,
                                      ofrenda_total, ofrenda_presencial, ofrenda_virtual,
                                      notas, registrado_por)
    values (p_ministerio_id, p_fecha, p_tema, p_modalidad,
            v_total, v_presencial, v_virtual,
            p_notas, auth.uid())
    on conflict (ministerio_id, fecha) do update
      set tema = excluded.tema,
          modalidad_usada = excluded.modalidad_usada,
          ofrenda_total = excluded.ofrenda_total,
          ofrenda_presencial = excluded.ofrenda_presencial,
          ofrenda_virtual = excluded.ofrenda_virtual,
          notas = excluded.notas
    returning id into v_reunion_id;
  else
    -- `registrado_por` no se toca: es quien la cargó, no quien la corrigió.
    update reuniones_ministerio
       set fecha              = p_fecha,
           tema               = p_tema,
           modalidad_usada    = p_modalidad,
           ofrenda_total      = v_total,
           ofrenda_presencial = v_presencial,
           ofrenda_virtual    = v_virtual,
           notas              = p_notas
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
  -- contra unique (ministerio_id, fecha).
  when unique_violation then
    raise exception 'Ese ministerio ya tiene una reunión registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion_ministerio(uuid, date, text, modalidad, numeric, text, jsonb, uuid, numeric, numeric) is
  'Alta o edición transaccional de una reunión de ministerio con sus asistencias. ESPEJO de registrar_reunion: toda corrección va en las dos. Con p_ofrenda_presencial/p_ofrenda_virtual el total es la suma (0036); sin ellos se guarda p_ofrenda sin desglose. Autoriza por pertenencia a ministerio_lideres, nunca por registrado_por.';

grant execute on function public.registrar_reunion_ministerio(uuid, date, text, modalidad, numeric, text, jsonb, uuid, numeric, numeric) to authenticated;
