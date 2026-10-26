-- =====================================================================
-- 0037_eliminar_mi_cuenta.sql
-- Cada persona puede borrar su propia cuenta desde la app.
--
-- Contexto: la App Store exige (guideline 5.1.1(v)) que toda app que permite
-- crear una cuenta permita también borrarla desde adentro, sin pedírselo a
-- nadie. Borrar un usuario de `auth.users` requiere la service role, que la
-- app no tiene ni debe tener: por eso es una RPC `security definer` que solo
-- puede borrar a quien la llama (`auth.uid()`), nunca a otro.
--
-- QUÉ SE BORRA
-- ------------
-- - El usuario de `auth.users` (login, sesiones, identidades).
-- - Su fila de `profiles` (cascade desde 0001): rol, username, nombre tipeado.
-- - Sus filas de `ministerio_lideres` (cascade, 0024): deja de liderar.
--
-- QUÉ NO SE BORRA
-- ---------------
-- - La ficha del padrón (`miembros`). Es el registro de la iglesia, lo mantiene
--   la administración y existe con o sin cuenta (0001: "todas las personas;
--   sin login"). `profiles.miembro_id` simplemente desaparece con el perfil.
-- - Las reuniones, eventos, actividades y anuncios que la persona registró:
--   son la contabilidad y la agenda de la iglesia. Pierden el autor
--   (`registrado_por`, `creado_por`, `autor_id`, `editado_por` → null), que
--   nunca fue parte de un permiso (ver CLAUDE.md, ministerios).
-- - El grupo que lideraba: queda sin discipulador (`discipulador_id` → null)
--   hasta que un admin le asigne otro. Las FK de 0001 no tienen `on delete`,
--   así que sin estos updates el borrado fallaría por violación de FK.
--
-- `anuncios` congela `autor_id` con un trigger (0026), que revertiría el
-- update a null y haría fallar el borrado. El trigger se redefine para dejar
-- pasar ese único caso, marcado con una variable local a la transacción que
-- solo setea esta RPC (PostgREST no expone `set_config`, así que el cliente
-- no puede prenderla por su cuenta).
--
-- ÚNICO BLOQUEO: el último admin no puede borrarse. Dejaría la iglesia sin
-- nadie que apruebe cuentas ni administre; tiene que nombrar a otro antes.
--
-- Depende de 0001 (profiles, FK a auth.users), 0013 (es_admin con roles
-- expandidos), 0015, 0025, 0026 y 0031 (tablas con columnas de autor).
-- =====================================================================

create or replace function public.anuncios_conserva_autor()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.eliminando_cuenta', true) is distinct from 'on' then
    new.autor_id := old.autor_id;
  end if;
  return new;
end;
$$;

create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no_autenticado';
  end if;

  if exists (select 1 from profiles where id = v_uid and rol = 'admin')
     and not exists (select 1 from profiles where rol = 'admin' and id <> v_uid) then
    raise exception 'ultimo_admin';
  end if;

  perform set_config('app.eliminando_cuenta', 'on', true);

  update discipulados         set discipulador_id = null where discipulador_id = v_uid;
  update reuniones            set registrado_por  = null where registrado_por  = v_uid;
  update reuniones_ministerio set registrado_por  = null where registrado_por  = v_uid;
  update reuniones_obreros    set registrado_por  = null where registrado_por  = v_uid;
  update reuniones_obreros    set editado_por     = null where editado_por     = v_uid;
  update eventos              set creado_por      = null where creado_por      = v_uid;
  update actividades          set creado_por      = null where creado_por      = v_uid;
  update anuncios             set autor_id        = null where autor_id        = v_uid;

  -- Cascade: auth.users → profiles → ministerio_lideres.
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
