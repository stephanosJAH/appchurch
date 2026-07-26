-- =====================================================================
-- 0019_mi_grupo.sql
-- El miembro ve SU discipulado y el historial de reuniones del grupo.
--
-- Contexto: hasta acá "Mi grupo" (app/(tabs)/discipulado.tsx) le mostraba
-- a un 'miembro' un cartel de "no tenés discipulado asignado", porque la
-- RLS de 0002 lo tapia por completo: `disc_select` = admin o líder,
-- `part_all` / `reu_all` / `asis_all` = admin o líder del grupo. No hay
-- forma de resolverlo en el front.
--
-- Se abre con dos RPC security definer en vez de aflojar la RLS, porque
-- lo que el participante puede ver es un SUBSET, no la tabla:
--   * mi_grupo()               -> sus grupos (activos), sin datos de gestión.
--   * reuniones_de_mi_grupo(id)-> fecha + tema + quiénes estuvieron.
--
-- Lo que queda AFUERA a propósito de reuniones_de_mi_grupo: `ofrenda_total`,
-- `notas`, `material_url` y `modalidad_usada`. La ofrenda y las notas del
-- líder son datos de gestión (el feed del miembro ya los esconde, ver
-- index.tsx); acá se corta en el backend, no en la UI.
--
-- Sobre los nombres de los participantes: es la única superficie donde un
-- miembro ve a un menor de edad (el `directorio` los excluye desde 0017).
-- Se limita a nombre y apellido — sin teléfono, sin fecha de nacimiento,
-- sin edad — y solo entre gente del mismo grupo, que ya se conoce de las
-- reuniones. El padrón completo sigue cerrado (RLS de `miembros`, 0014).
--
-- Depende de 0013 (es_miembro_activo) y 0018 (profiles.miembro_id enlazado
-- al aprobar; sin ese link ambas funciones devuelven vacío).
-- =====================================================================

-- ===== Los discipulados en los que participa quien llama =====
-- Resuelve auth.uid() -> profiles.miembro_id -> participaciones (activas)
-- -> discipulados (activos). Si miembro_id es null (cuenta vieja, previa a
-- 0018, nunca enlazada) el join no matchea y devuelve 0 filas: la UI
-- muestra el vacío en vez de romper.
-- Devuelve el nombre del discipulador ya resuelto para no obligar a un
-- join contra `profiles`, que la RLS no le deja leer.
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
         d.enlace_virtual, lider.nombre_completo
  from participaciones pa
  join discipulados d on d.id = pa.discipulado_id
  left join profiles lider on lider.id = d.discipulador_id
  where public.es_miembro_activo()
    and pa.activo
    and d.activo
    and pa.miembro_id = (select p.miembro_id from profiles p where p.id = auth.uid())
  order by d.dia_semana, d.hora_inicio;
$$;

-- ===== Historial de reuniones de un grupo, visto por un participante =====
-- Solo fecha, tema y los presentes. Exige participación ACTIVA en ese
-- grupo: pasar el uuid de un discipulado ajeno da error, no filas vacías.
create or replace function public.reuniones_de_mi_grupo(p_discipulado_id uuid)
returns table (
  id            uuid,
  fecha         date,
  tema          text,
  participantes text[]
)
language plpgsql security definer set search_path = public stable as $$
declare
  v_miembro_id uuid;
begin
  if not es_miembro_activo() then
    raise exception 'Tu cuenta no está habilitada';
  end if;

  select p.miembro_id into v_miembro_id from profiles p where p.id = auth.uid();

  -- Cuenta sin ficha del padrón enlazada: no participa de nada todavía.
  if v_miembro_id is null then
    return;
  end if;

  if not exists (
    select 1 from participaciones pa
    where pa.discipulado_id = p_discipulado_id
      and pa.miembro_id = v_miembro_id
      and pa.activo
  ) then
    raise exception 'No participás de este discipulado';
  end if;

  return query
    select r.id, r.fecha, r.tema,
           -- array(subquery) devuelve '{}' si no hay presentes, nunca null.
           array(
             select btrim(m.nombre || ' ' || coalesce(m.apellido, ''))
             from asistencias a
             join miembros m on m.id = a.miembro_id
             where a.reunion_id = r.id and a.presente
             order by m.nombre, m.apellido
           ) as participantes
    from reuniones r
    where r.discipulado_id = p_discipulado_id
    order by r.fecha desc;
end;
$$;

grant execute on function public.mi_grupo() to authenticated;
grant execute on function public.reuniones_de_mi_grupo(uuid) to authenticated;
