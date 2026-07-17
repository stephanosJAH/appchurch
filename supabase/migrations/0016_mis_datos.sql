-- =====================================================================
-- 0016_mis_datos.sql
-- Autogestión de datos personales desde el perfil (ver docs/ROLES-Y-PERMISOS.md).
--
-- Contexto: los datos personales viven en `miembros` y se enlazan a la cuenta
-- por `profiles.miembro_id`. Hoy ese link no lo puebla nada (el registro/aprobación
-- no lo setea) y la RLS de `miembros` (0009/0014) solo deja leer/escribir al admin
-- o al discipulador de esa persona. Un miembro común no puede ni ver ni tocar su
-- propia ficha.
--
-- En vez de aflojar la RLS de `miembros`, se expone la autogestión por DOS
-- funciones security-definer acotadas SIEMPRE al `auth.uid()` del que llama:
--   * mis_datos()        -> lee SOLO los campos editables (nunca `notas`).
--   * guardar_mis_datos()-> crea+enlaza la ficha en el 1er guardado, o actualiza
--                            la ya enlazada. Nunca toca `notas` (queda para el
--                            discipulador) y no la devuelve.
--
-- Campos autoeditables (decisión de producto): nombre, apellido, sexo,
-- fecha_nacimiento, telefono, email. `notas` NO: suele tener notas pastorales
-- privadas y queda solo para obrero/admin (ver 0014_directorio.sql).
-- Depende de 0013 (es_miembro_activo).
-- =====================================================================

-- ===== Lectura: solo los campos que el miembro puede autoeditar =====
-- Definer para poder leer la fila propia sin abrir el SELECT de `miembros`.
-- Devuelve 0 filas si la cuenta aún no tiene ficha enlazada. `notas` nunca sale.
create or replace function public.mis_datos()
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  sexo             sexo,
  fecha_nacimiento date,
  telefono         text,
  email            text
)
language sql security definer set search_path = public stable as $$
  select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono, m.email
  from miembros m
  join profiles p on p.miembro_id = m.id
  where p.id = auth.uid();
$$;

grant execute on function public.mis_datos() to authenticated;

-- ===== Escritura: crea+enlaza en el 1er guardado, o actualiza la enlazada =====
-- Acotada al usuario actual: nunca puede apuntar a la ficha de otra persona ni
-- crear más de una (tras el 1er insert, `miembro_id` queda seteado y luego actualiza).
-- No toca `notas`. Solo miembros activos (un 'pendiente' no gestiona su ficha).
create or replace function public.guardar_mis_datos(
  p_nombre           text,
  p_apellido         text,
  p_sexo             sexo,
  p_fecha_nacimiento date,
  p_telefono         text,
  p_email            text
)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  sexo             sexo,
  fecha_nacimiento date,
  telefono         text,
  email            text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_miembro_id uuid;
  v_nombre     text := btrim(coalesce(p_nombre, ''));
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not es_miembro_activo() then
    raise exception 'Tu cuenta no está habilitada';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select p.miembro_id into v_miembro_id from profiles p where p.id = v_uid;

  if v_miembro_id is null then
    insert into miembros (nombre, apellido, sexo, fecha_nacimiento, telefono, email)
    values (v_nombre, p_apellido, coalesce(p_sexo, 'M'::sexo), p_fecha_nacimiento, p_telefono, p_email)
    returning miembros.id into v_miembro_id;
    update profiles set miembro_id = v_miembro_id where id = v_uid;
  else
    update miembros m set
      nombre           = v_nombre,
      apellido         = p_apellido,
      sexo             = coalesce(p_sexo, m.sexo),
      fecha_nacimiento = p_fecha_nacimiento,
      telefono         = p_telefono,
      email            = p_email
    where m.id = v_miembro_id;
  end if;

  return query
    select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono, m.email
    from miembros m
    where m.id = v_miembro_id;
end;
$$;

grant execute on function public.guardar_mis_datos(text, text, sexo, date, text, text) to authenticated;
