-- =====================================================================
-- 0011_materiales_scope.sql
-- Hallazgo de seguridad #7 (MEDIA): el bucket privado `materiales` (0004) tenía
-- policies de escritura abiertas a cualquier autenticado y SIN policy de DELETE:
--   * materiales_update: cualquier autenticado podía SOBRESCRIBIR cualquier
--     archivo (el material de otro grupo, no solo el suyo).
--   * no había DELETE (borrado descontrolado/imposible según el caso).
--
-- El bucket hoy NO se usa desde la app (fue scaffolding de "Fase 2":
-- reuniones.material_url siempre se guarda null y no hay código que suba a
-- `materiales`). Se asegura ahora para que quede seguro-por-defecto cuando se
-- construya la subida de material de lección.
--
-- Convención de rutas (a respetar en el código de subida de Fase 2):
--   los archivos van bajo `<auth.uid()>/...` (la primera carpeta = dueño).
--   Ej: supabase.storage.from('materiales').upload(`${user.id}/leccion.pdf`, ...)
--
-- Escritura (insert/update/delete): admin, o el dueño de la carpeta.
-- Lectura: se mantiene para cualquier autenticado (material compartido; el
--   bucket es privado, así que igual requiere sesión / URL firmada).
-- =====================================================================

-- Lectura: sin cambios (autenticado). Se recrea idempotente por claridad.
drop policy if exists "materiales_read" on storage.objects;
create policy "materiales_read" on storage.objects for select
  using (bucket_id = 'materiales' and auth.role() = 'authenticated');

-- Alta: solo bajo la carpeta propia (o admin).
drop policy if exists "materiales_insert" on storage.objects;
create policy "materiales_insert" on storage.objects for insert
  with check (
    bucket_id = 'materiales'
    and (public.es_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Sobrescritura: solo el dueño (o admin). Cierra el pisado de material ajeno.
drop policy if exists "materiales_update" on storage.objects;
create policy "materiales_update" on storage.objects for update
  using (
    bucket_id = 'materiales'
    and (public.es_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  )
  with check (
    bucket_id = 'materiales'
    and (public.es_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Borrado: faltaba. Solo el dueño (o admin).
drop policy if exists "materiales_delete" on storage.objects;
create policy "materiales_delete" on storage.objects for delete
  using (
    bucket_id = 'materiales'
    and (public.es_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
