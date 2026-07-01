-- =====================================================================
-- 0003_rpc.sql — RPCs transaccionales + trigger de creación de perfil
-- =====================================================================

-- ===== registrar_reunion: guarda reunión + asistencias de una sola vez =====
-- Idempotente: si ya existe la reunión de esa fecha, actualiza.
-- p_asistencias: jsonb array de { miembro_id, presente, modalidad }
create or replace function public.registrar_reunion(
  p_discipulado_id uuid,
  p_fecha          date,
  p_tema           text,
  p_material_url   text,
  p_modalidad      modalidad,
  p_ofrenda        numeric,
  p_notas          text,
  p_asistencias    jsonb
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_reunion_id uuid;
begin
  if not (es_admin() or es_discipulador_de(p_discipulado_id)) then
    raise exception 'No autorizado para este discipulado';
  end if;

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

  insert into asistencias (reunion_id, miembro_id, presente, modalidad)
  select v_reunion_id,
         (a->>'miembro_id')::uuid,
         coalesce((a->>'presente')::boolean, true),
         (a->>'modalidad')::modalidad
  from jsonb_array_elements(p_asistencias) a
  on conflict (reunion_id, miembro_id) do update
    set presente = excluded.presente,
        modalidad = excluded.modalidad;

  return v_reunion_id;
end;
$function$;

-- ===== agregar_discipulo: crea miembro y lo suma a un discipulado =====
-- Útil para incorporar un discípulo nuevo en el momento de la reunión.
create or replace function public.agregar_discipulo(
  p_discipulado_id uuid,
  p_nombre         text,
  p_apellido       text,
  p_sexo           sexo,
  p_telefono       text default null,
  p_email          text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_miembro_id uuid;
begin
  if not (es_admin() or es_discipulador_de(p_discipulado_id)) then
    raise exception 'No autorizado para este discipulado';
  end if;

  insert into miembros (nombre, apellido, sexo, telefono, email)
  values (p_nombre, p_apellido, p_sexo, p_telefono, p_email)
  returning id into v_miembro_id;

  insert into participaciones (discipulado_id, miembro_id)
  values (p_discipulado_id, v_miembro_id)
  on conflict (discipulado_id, miembro_id) do nothing;

  return v_miembro_id;
end;
$function$;

-- ===== Trigger: crear profile automáticamente al registrarse un usuario =====
-- Rol por defecto 'discipulador'. Un admin puede promover luego.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  insert into public.profiles (id, nombre_completo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre_completo', new.email));
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Permisos de ejecución para usuarios autenticados =====
grant execute on function public.registrar_reunion(uuid, date, text, text, modalidad, numeric, text, jsonb) to authenticated;
grant execute on function public.agregar_discipulo(uuid, text, text, sexo, text, text) to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_discipulador_de(uuid) to authenticated;
