-- =====================================================================
-- 0013_registro_aprobacion.sql
-- Registro con aprobación (ver docs/PLAN-RED-IGLESIA.md, Fase 1).
-- Resuelve el hallazgo #1 Parte A: una cuenta nueva queda 'pendiente' (sin
-- acceso) hasta que un obrero o admin la activa a 'miembro'. El signup ya no
-- otorga rol de gestión por defecto.
-- Depende de 0012 (los valores de enum 'pendiente'/'miembro' ya existen).
-- =====================================================================

-- ===== profiles: default 'pendiente' + username para login usuario/teléfono =====
alter table profiles alter column rol set default 'pendiente';
alter table profiles add column if not exists username text unique;

-- ===== Trigger de creación de perfil: copia también el username =====
-- El rol queda en el default de columna ('pendiente'). El username lo manda el
-- cliente ya normalizado en raw_user_meta_data (ver lib/authIdentity.ts).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  insert into public.profiles (id, nombre_completo, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    new.raw_user_meta_data->>'username'
  );
  return new;
end;
$function$;

-- ===== Helpers de rol (mismo patrón security definer que es_admin, 0002) =====
create or replace function public.es_obrero()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol in ('obrero', 'admin')
  );
$$;

create or replace function public.es_miembro_activo()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol in ('miembro', 'obrero', 'admin')
  );
$$;

grant execute on function public.es_obrero() to authenticated;
grant execute on function public.es_miembro_activo() to authenticated;

-- ===== Trigger anti auto-escalada (reemplaza la lógica de 0010) =====
-- 0010 solo permitía cambios de rol al admin. Ahora además un obrero puede
-- ACTIVAR a un pendiente (-> miembro), pero nadie puede promoverse a
-- obrero/admin por su cuenta. El trigger trg_no_autoescalar_rol (creado en
-- 0010) sigue apuntando a esta función: 'create or replace' basta.
create or replace function public.no_autoescalar_rol()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rol is distinct from old.rol then
    -- contexto de servidor / bootstrap del primer admin (SQL Editor, service_role)
    if auth.uid() is null then
      return new;
    end if;
    -- admin: cualquier cambio de rol
    if es_admin() then
      return new;
    end if;
    -- obrero: solo activar pendientes (pendiente -> miembro), nunca a sí mismo
    if es_obrero()
       and old.rol = 'pendiente'
       and new.rol = 'miembro'
       and new.id <> auth.uid() then
      return new;
    end if;
    raise exception 'No autorizado para cambiar el rol';
  end if;
  return new;
end;
$$;

-- ===== Policies de profiles para la aprobación por obreros =====
-- (se suman, PERMISSIVE/OR, a prof_select / prof_update_self / prof_admin de 0002)

-- Un obrero puede LISTAR los pendientes para poder aprobarlos.
drop policy if exists prof_obrero_ve_pendientes on profiles;
create policy prof_obrero_ve_pendientes on profiles for select
  using (es_obrero() and rol = 'pendiente');

-- Un obrero puede ACTIVARLOS (pendiente -> miembro). El with check acota el
-- destino: no puede dejarlos en obrero/admin. El trigger es la 2da barrera.
drop policy if exists prof_obrero_activar on profiles;
create policy prof_obrero_activar on profiles for update
  using (es_obrero() and rol = 'pendiente')
  with check (es_obrero() and rol = 'miembro');
