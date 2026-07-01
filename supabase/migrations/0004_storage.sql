-- =====================================================================
-- 0004_storage.sql — Bucket para documentos de lección (Fase 2)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('materiales', 'materiales', false)
on conflict (id) do nothing;

-- Cualquier autenticado puede leer y subir material de lección.
create policy "materiales_read" on storage.objects for select
  using (bucket_id = 'materiales' and auth.role() = 'authenticated');

create policy "materiales_insert" on storage.objects for insert
  with check (bucket_id = 'materiales' and auth.role() = 'authenticated');

create policy "materiales_update" on storage.objects for update
  using (bucket_id = 'materiales' and auth.role() = 'authenticated');
