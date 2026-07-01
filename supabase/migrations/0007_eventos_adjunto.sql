-- =====================================================================
-- 0007_eventos_adjunto.sql — Adjunto (flyer/imagen o PDF) para actividades
-- Cada evento puede tener a lo sumo un adjunto: una imagen o un PDF.
-- Se guarda en el bucket público 'adjuntos' y se referencia por URL.
-- =====================================================================

alter table eventos
  add column if not exists adjunto_url  text,
  add column if not exists adjunto_tipo text
    check (adjunto_tipo in ('imagen', 'pdf'));

-- ===== Bucket público para flyers/adjuntos de actividades =====
-- Público: las imágenes se muestran directo por URL sin firmar.
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do nothing;

-- Lectura pública (bucket public); escritura solo para admins.
create policy "adjuntos_read" on storage.objects for select
  using (bucket_id = 'adjuntos');

create policy "adjuntos_insert" on storage.objects for insert
  with check (bucket_id = 'adjuntos' and public.es_admin());

create policy "adjuntos_update" on storage.objects for update
  using (bucket_id = 'adjuntos' and public.es_admin());

create policy "adjuntos_delete" on storage.objects for delete
  using (bucket_id = 'adjuntos' and public.es_admin());
