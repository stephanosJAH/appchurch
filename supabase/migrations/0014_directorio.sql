-- =====================================================================
-- 0014_directorio.sql
-- Directorio de la congregación + cierre del padrón (ver PLAN-RED-IGLESIA.md).
-- Resuelve el hallazgo #1 Parte B: el SELECT de `miembros` deja de estar
-- abierto a cualquier autenticado. El PII completo (email, notas) queda solo
-- para admin y para el obrero que gestiona a ese miembro. Todo miembro activo
-- ve un subset seguro (nombre, apellido, sexo, cumpleaños, teléfono) por la
-- vista `directorio`.
-- Depende de 0013 (es_miembro_activo, es_obrero) y de 0009
-- (es_discipulador_del_miembro).
-- =====================================================================

-- ===== Cierra el SELECT del padrón al obrero del miembro (o admin) =====
drop policy if exists miembros_select on miembros;
create policy miembros_select on miembros for select using (
  es_admin() or es_discipulador_del_miembro(id)
);

-- ===== INSERT solo por gestión =====
-- La creación real de miembros pasa por la RPC agregar_discipulo (security
-- definer, 0003). Este check cubre el upsert de edición (miembro/[id].tsx), que
-- lo hacen obreros/admins; un 'miembro' común ya no puede crear filas sueltas.
drop policy if exists miembros_insert on miembros;
create policy miembros_insert on miembros for insert
  with check (es_admin() or es_obrero());

-- ===== Vista directorio: subset seguro, gateada por rol =====
-- security_invoker = false -> la vista corre como su dueño (bypassa la RLS de
-- miembros) y expone SOLO las columnas seguras. El WHERE la restringe a
-- miembros activos, así un 'pendiente' recibe 0 filas. email y notas nunca
-- salen por acá.
drop view if exists public.directorio;
create view public.directorio with (security_invoker = false) as
  select id, nombre, apellido, sexo, fecha_nacimiento, telefono
  from public.miembros
  where public.es_miembro_activo();

revoke all on public.directorio from anon;
grant select on public.directorio to authenticated;
