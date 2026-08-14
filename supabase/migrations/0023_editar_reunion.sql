-- =====================================================================
-- 0023_editar_reunion.sql
-- Editar una reunión ya registrada.
--
-- Contexto: `registrar_reunion` (0003) sabía guardar "la reunión de tal grupo
-- en tal fecha". El upsert por (discipulado_id, fecha) ya alcanzaba para
-- corregir tema, ofrenda, notas o quién vino — volviendo a registrar la misma
-- fecha —, pero no para arreglar el error más común: la fecha equivocada.
-- Cambiarla creaba una reunión nueva y dejaba la vieja colgada, con su ofrenda
-- sumando de más en el desglose.
--
-- La RPC pasa a aceptar `p_reunion_id`:
--   * null -> alta. Idéntico a 0003: upsert por (discipulado_id, fecha).
--   * uuid -> edición de ESA reunión, donde la fecha es un campo más.
--
-- Autorización (sin cambios de política): admin o discipulador del grupo. Al
-- editar se valida contra el `discipulado_id` **guardado en la reunión**, no
-- contra el que venga por parámetro — si no, alcanzaría con mandar el id de
-- una reunión ajena junto al id del grupo propio para pasar el control.
-- `p_discipulado_id` se ignora al editar: mover una reunión de grupo no es una
-- corrección de tipeo, y el historial de asistencias no tendría sentido en
-- otro roster.
--
-- Asistencias al editar: el payload es el estado final, no un agregado. Las
-- que ya no vienen se borran, porque sacar a alguien de la lista de presentes
-- es justamente una de las correcciones que se piden. Para que eso no se lleve
-- puesto el historial, el formulario (app/reunion/nueva.tsx) arma la lista
-- como la unión de los participantes activos del grupo **y** de quienes
-- quedaron registrados en esa reunión aunque ya no estén en el grupo.
-- En el alta se conserva la semántica aditiva de 0003: quien registra una
-- fecha nueva nunca está pidiendo borrar a nadie.
--
-- Lo que queda AFUERA a propósito:
--   * Auditoría de la edición (`editado_por` / `editado_en`). `registrado_por`
--     sigue siendo quien la cargó. Si más adelante hace falta saber quién
--     tocó qué, es una tabla de historial, no dos columnas.
--   * Borrar una reunión. Con la fecha editable, el caso real ("la cargué en
--     el día equivocado") se resuelve corrigiendo, y no hay forma de deshacer
--     un delete.
--
-- Depende de 0001 (esquema, unique (discipulado_id, fecha)), 0002 (es_admin,
-- es_discipulador_de) y 0003 (versión original de la RPC).
-- =====================================================================

-- `create or replace` no puede cambiar la firma: se dropea la de 8 argumentos
-- de 0003 para no dejar dos overloads (PostgREST resuelve por nombre de
-- argumento y no sabría elegir). Los clientes viejos que no manden
-- `p_reunion_id` siguen andando: el parámetro tiene default.
drop function if exists public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb);

create or replace function public.registrar_reunion(
  p_discipulado_id uuid,
  p_fecha          date,
  p_tema           text,
  p_material_url   text,
  p_modalidad      modalidad,
  p_ofrenda        numeric,
  p_notas          text,
  p_asistencias    jsonb,
  p_reunion_id     uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id uuid;
  v_grupo_id   uuid;
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

  if p_reunion_id is null then
    insert into reuniones (discipulado_id, fecha, tema, material_url,
                           modalidad_usada, ofrenda_total, notas, registrado_por)
    values (p_discipulado_id, p_fecha, p_tema, p_material_url,
            p_modalidad, coalesce(p_ofrenda, 0), p_notas, auth.uid())
    on conflict (discipulado_id, fecha) do update
      set tema = excluded.tema,
          material_url = excluded.material_url,
          modalidad_usada = excluded.modalidad_usada,
          ofrenda_total = excluded.ofrenda_total,
          notas = excluded.notas
    returning id into v_reunion_id;
  else
    -- `registrado_por` no se toca: es quien la cargó, no quien la corrigió.
    update reuniones
       set fecha           = p_fecha,
           tema            = p_tema,
           material_url    = p_material_url,
           modalidad_usada = p_modalidad,
           ofrenda_total   = coalesce(p_ofrenda, 0),
           notas           = p_notas
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
  -- unique (discipulado_id, fecha) de 0001. El mensaje crudo de Postgres no le
  -- dice nada a quien está cargando la asistencia.
  when unique_violation then
    raise exception 'Ese grupo ya tiene una reunión registrada en esa fecha';
end;
$function$;

comment on function public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb, uuid) is
  'Alta o edición transaccional de una reunión con sus asistencias. Sin p_reunion_id da de alta (upsert por discipulado_id + fecha); con p_reunion_id edita esa reunión (la fecha es editable y las asistencias que no vengan en el payload se borran). Autoriza contra el grupo de la reunión: es_admin() o es_discipulador_de().';

grant execute on function public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb, uuid) to authenticated;
