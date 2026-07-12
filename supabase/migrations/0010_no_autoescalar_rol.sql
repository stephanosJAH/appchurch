-- =====================================================================
-- 0010_no_autoescalar_rol.sql
-- Hallazgo de seguridad #3 (ALTA): auto-escalada de privilegios.
-- La policy `prof_update_self` (0002_rls) deja que cada usuario edite su propio
-- perfil, pero NO impedía cambiar la columna `rol`. Cualquier autenticado podía:
--   UPDATE profiles SET rol = 'admin' WHERE id = auth.uid();
-- y con eso pasar es_admin() -> control total del backend.
--
-- Fix: trigger BEFORE UPDATE que bloquea el cambio de `rol` salvo que el actor
-- sea admin.
--
-- Guard `auth.uid() is not null`: cuando NO hay usuario autenticado (SQL Editor,
-- service_role, migraciones) se permite el cambio. Son contextos de servidor de
-- confianza y, además, un anónimo por la API nunca llega acá: RLS ya lo frena
-- (prof_update_self exige id = auth.uid(); prof_admin exige es_admin()). Sin este
-- guard, el bootstrap del primer admin por SQL Editor quedaría bloqueado.
--
-- El cambio de rol legítimo se preserva:
--   * app/admin/usuarios.tsx -> useUpdateRol: el actor es admin -> permitido.
--   * bootstrap del primer admin (SQL Editor): auth.uid() null -> permitido.
--   * ediciones normales del propio perfil (no tocan rol): permitido.
-- =====================================================================

create or replace function public.no_autoescalar_rol()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.rol is distinct from old.rol
     and auth.uid() is not null
     and not es_admin() then
    raise exception 'No podés cambiar tu propio rol';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_no_autoescalar_rol on profiles;
create trigger trg_no_autoescalar_rol
  before update on profiles
  for each row execute function public.no_autoescalar_rol();
