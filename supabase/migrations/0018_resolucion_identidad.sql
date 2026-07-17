-- =====================================================================
-- 0018_resolucion_identidad.sql
-- La aprobación deja de ser "¿la habilito?" y pasa a ser "¿quién es esta
-- persona?". Ver docs/ROLES-Y-PERMISOS.md y el análisis de arquitectura
-- que motiva esto.
--
-- Contexto: con el alcance nuevo (toda la congregación, no solo líderes),
-- la mayoría de quienes se registran YA están en el padrón `miembros`
-- (los cargó su discipulador antes de que existiera el login). El flujo
-- viejo (`useActivarMiembro`: solo `update profiles set rol='miembro'`)
-- no enlazaba nada — `guardar_mis_datos` (0016) terminaba creando una
-- ficha nueva la primera vez que la persona autoeditaba sus datos, y esa
-- persona quedaba duplicada en `miembros` (una ficha vieja con su
-- historial de asistencia, una ficha nueva sin nada).
--
-- La aprobación es el único momento con un humano (el obrero) que conoce
-- a la persona. Acá se resuelve la identidad, no después:
--   * candidatos_para_perfil()      -> busca en el padrón por nombre/tel.
--   * resolver_identidad_pendiente()-> enlaza a una ficha existente, o
--                                       crea una nueva si de verdad no
--                                       está, y activa la cuenta. Todo en
--                                       un solo paso atómico: no queda
--                                       forma de activar sin resolver.
-- Depende de 0013 (es_obrero, trigger no_autoescalar_rol) y 0016 (mis_datos).
-- =====================================================================

-- pg_trgm: extensión estándar de Postgres para similitud de texto (nombres
-- mal tipeados, apodos, orden invertido de nombre/apellido). Alternativa
-- aburrida y de librería, no un algoritmo propio.
create extension if not exists pg_trgm;

-- ===== Un miembro del padrón se enlaza a lo sumo a UNA cuenta =====
-- Nullable: admite múltiples NULL (persona sin cuenta todavía), pero una
-- vez enlazado no puede volver a enlazarse desde otra cuenta. Sin esto, el
-- chequeo de "esa ficha ya está enlazada" en resolver_identidad_pendiente
-- tiene una ventana de carrera entre dos obreros aprobando a la vez.
alter table profiles
  add constraint profiles_miembro_id_unique unique (miembro_id);

-- ===== Buscar candidatos del padrón para una cuenta pendiente =====
-- Rankea por similitud de nombre+apellido, con el teléfono como señal
-- fuerte (no autoridad: en una iglesia el teléfono suele ser el de un
-- familiar, así que ayuda a ordenar, nunca decide solo). Devuelve el
-- teléfono enmascarado (últimos 4 dígitos) — alcanza para que el obrero
-- reconozca el número sin exponer el PII completo del padrón.
-- Excluye a quien ya tiene una cuenta enlazada (unique de arriba).
create or replace function public.candidatos_para_perfil(p_profile_id uuid)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  telefono_parcial text,
  similitud        real
)
language plpgsql security definer set search_path = public stable as $$
declare
  v_nombre   text;
  v_username text;
  v_digitos  text;
begin
  if not es_obrero() then
    raise exception 'No autorizado';
  end if;

  select p.nombre_completo, p.username into v_nombre, v_username
  from profiles p
  where p.id = p_profile_id;

  if v_nombre is null then
    raise exception 'Perfil no encontrado';
  end if;

  -- username es el identificador normalizado de login (lib/authIdentity.ts):
  -- si es solo dígitos, la persona se registró con su teléfono.
  v_digitos := case when v_username ~ '^[0-9]+$' then v_username else null end;

  return query
    select
      m.id,
      m.nombre,
      m.apellido,
      case when m.telefono is null then null
           else repeat('•', greatest(length(regexp_replace(m.telefono, '\D', '', 'g')) - 4, 0))
                || right(regexp_replace(m.telefono, '\D', '', 'g'), 4)
      end as telefono_parcial,
      greatest(
        similarity(v_nombre, coalesce(m.nombre, '') || ' ' || coalesce(m.apellido, '')),
        case when v_digitos is not null and m.telefono is not null
                  and right(regexp_replace(m.telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
             then 1.0
             else 0.0
        end
      ) as similitud
    from miembros m
    where not exists (select 1 from profiles p2 where p2.miembro_id = m.id)
    order by similitud desc, m.nombre
    limit 15;
end;
$$;

grant execute on function public.candidatos_para_perfil(uuid) to authenticated;

-- ===== Resolver identidad + activar, en un solo paso atómico =====
-- Reemplaza el `update profiles set rol='miembro'` directo de
-- useActivarMiembro (lib/queries/profiles.ts). Dos modos, mutuamente
-- excluyentes según si p_miembro_id viene o no:
--   * enlazar ficha existente (p_miembro_id de candidatos_para_perfil)
--   * crear ficha nueva (la persona de verdad no está en el padrón) con
--     los datos mínimos que el obrero carga en el momento
-- No existe camino para activar sin que quede una de las dos cosas hecha.
create or replace function public.resolver_identidad_pendiente(
  p_profile_id       uuid,
  p_miembro_id       uuid default null,
  p_nombre           text default null,
  p_apellido         text default null,
  p_sexo             sexo default null,
  p_fecha_nacimiento date default null,
  p_telefono         text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_miembro_id uuid := p_miembro_id;
  v_rol        rol_app;
  v_ya_ligado  boolean;
  v_nombre     text := btrim(coalesce(p_nombre, ''));
begin
  if not es_obrero() then
    raise exception 'No autorizado';
  end if;

  select p.rol into v_rol from profiles p where p.id = p_profile_id;
  if v_rol is null then
    raise exception 'La cuenta no existe';
  end if;
  if v_rol <> 'pendiente' then
    raise exception 'La cuenta ya no está pendiente';
  end if;

  if v_miembro_id is not null then
    select exists(select 1 from profiles where miembro_id = v_miembro_id)
      into v_ya_ligado;
    if v_ya_ligado then
      raise exception 'Esa ficha del padrón ya está enlazada a otra cuenta';
    end if;
  else
    if v_nombre = '' then
      raise exception 'El nombre es obligatorio para crear la ficha';
    end if;
    if p_sexo is null then
      raise exception 'El sexo es obligatorio para crear la ficha';
    end if;
    insert into miembros (nombre, apellido, sexo, fecha_nacimiento, telefono)
    values (v_nombre, p_apellido, p_sexo, p_fecha_nacimiento, p_telefono)
    returning id into v_miembro_id;
  end if;

  -- Dispara trg_no_autoescalar_rol (0010/0013): valida que quien llama sea
  -- obrero/admin y que pendiente->miembro no sea sobre sí mismo. Ya lo
  -- comprobamos arriba con es_obrero(); el trigger es la 2da barrera.
  update profiles set miembro_id = v_miembro_id, rol = 'miembro'
  where id = p_profile_id;
end;
$$;

grant execute on function public.resolver_identidad_pendiente(
  uuid, uuid, text, text, sexo, date, text
) to authenticated;

-- ===== guardar_mis_datos deja de crear fichas =====
-- Con la identidad resuelta en la aprobación, todo 'miembro' llega acá
-- con miembro_id ya seteado. Si no lo tiene, es una cuenta vieja (previa
-- a este flujo) que nunca se enlazó: no hay forma segura de adivinar cuál
-- es su ficha desde este contexto (bajo auth.uid(), sin el padrón a la
-- vista), así que se corta con un error accionable en vez de crear una
-- ficha nueva a ciegas.
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
    raise exception
      'Tu cuenta no tiene una ficha del padrón enlazada. Pedile a un admin que la enlace.';
  end if;

  update miembros m set
    nombre           = v_nombre,
    apellido         = p_apellido,
    sexo             = coalesce(p_sexo, m.sexo),
    fecha_nacimiento = p_fecha_nacimiento,
    telefono         = p_telefono,
    email            = p_email
  where m.id = v_miembro_id;

  return query
    select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono, m.email
    from miembros m
    where m.id = v_miembro_id;
end;
$$;

grant execute on function public.guardar_mis_datos(text, text, sexo, date, text, text) to authenticated;
