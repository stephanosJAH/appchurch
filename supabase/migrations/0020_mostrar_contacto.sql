-- =====================================================================
-- 0020_mostrar_contacto.sql
-- Cada persona decide si su teléfono se publica en el directorio.
--
-- Contexto: desde 0014/0017 la vista `directorio` publica nombre, sexo,
-- cumpleaños y teléfono de todo adulto activo del padrón a cualquier
-- miembro aprobado. El teléfono lo cargó la iglesia (el discipulador, al
-- armar su grupo), no la persona — nunca hubo un "sí" explícito de su
-- parte. Acá se le da el control: un flag por miembro, autoeditable desde
-- "Mis datos" (app/mis-datos.tsx).
--
-- Default `true`: preserva lo que la congregación ve hoy. Cambiarlo a
-- `false` volvería el directorio opt-in y lo dejaría sin teléfonos hasta
-- que cada persona entre a activarlo (es una sola palabra acá si el
-- criterio de producto cambia).
--
-- Alcance: el flag tapa el teléfono en el DIRECTORIO (la vista que ve todo
-- miembro), no en la tabla `miembros`. El discipulador de esa persona y el
-- admin lo siguen viendo por la RLS de 0014: es el dato de contacto
-- pastoral, no la guía publicada. `email` y `notas` nunca salieron por la
-- vista, así que el flag no los toca.
-- Depende de 0017 (vista directorio) y 0018 (guardar_mis_datos update-only).
-- =====================================================================

alter table miembros
  add column if not exists mostrar_contacto boolean not null default true;

comment on column miembros.mostrar_contacto is
  'La persona acepta que su teléfono se publique en la vista `directorio`. No afecta lo que ven su discipulador ni el admin.';

-- ===== Vista directorio: el teléfono sale solo si la persona lo permite =====
-- La fila sigue apareciendo (nombre y cumpleaños son la parte comunitaria
-- del directorio); lo que se apaga es el contacto. `telefono` llega null y
-- la UI ya oculta los botones de llamar/WhatsApp en ese caso.
-- Se mantiene el filtro de adultos de 0017.
drop view if exists public.directorio;
create view public.directorio with (security_invoker = false) as
  select id, nombre, apellido, sexo, fecha_nacimiento,
         case when mostrar_contacto then telefono end as telefono
  from public.miembros
  where public.es_miembro_activo()
    and fecha_nacimiento is not null
    and fecha_nacimiento <= (current_date - interval '18 years')::date;

-- drop + create pierde los grants: se reponen igual que en 0014/0017.
revoke all on public.directorio from anon;
grant select on public.directorio to authenticated;

-- ===== mis_datos(): devuelve también la preferencia =====
-- Cambia el tipo de retorno (columna nueva), así que `create or replace`
-- no alcanza: hay que dropear primero.
drop function if exists public.mis_datos();
create function public.mis_datos()
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  sexo             sexo,
  fecha_nacimiento date,
  telefono         text,
  email            text,
  mostrar_contacto boolean
)
language sql security definer set search_path = public stable as $$
  select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono,
         m.email, m.mostrar_contacto
  from miembros m
  join profiles p on p.miembro_id = m.id
  where p.id = auth.uid();
$$;

grant execute on function public.mis_datos() to authenticated;

-- ===== guardar_mis_datos(): un parámetro más, opcional =====
-- Idéntica a 0018 (update-only, acotada a auth.uid(), nunca toca `notas`)
-- salvo por `p_mostrar_contacto`. Va con `default null` + coalesce para que
-- una app vieja, que manda los 6 argumentos de siempre, no le pise la
-- preferencia a nadie al guardar.
drop function if exists public.guardar_mis_datos(text, text, sexo, date, text, text);
create function public.guardar_mis_datos(
  p_nombre           text,
  p_apellido         text,
  p_sexo             sexo,
  p_fecha_nacimiento date,
  p_telefono         text,
  p_email            text,
  p_mostrar_contacto boolean default null
)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  sexo             sexo,
  fecha_nacimiento date,
  telefono         text,
  email            text,
  mostrar_contacto boolean
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
    raise exception
      'Tu cuenta no tiene una ficha del padrón enlazada. Pedile a un admin que la enlace.';
  end if;

  update miembros m set
    nombre           = v_nombre,
    apellido         = p_apellido,
    sexo             = coalesce(p_sexo, m.sexo),
    fecha_nacimiento = p_fecha_nacimiento,
    telefono         = p_telefono,
    email            = p_email,
    mostrar_contacto = coalesce(p_mostrar_contacto, m.mostrar_contacto)
  where m.id = v_miembro_id;

  return query
    select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono,
           m.email, m.mostrar_contacto
    from miembros m
    where m.id = v_miembro_id;
end;
$$;

grant execute on function public.guardar_mis_datos(text, text, sexo, date, text, text, boolean) to authenticated;
