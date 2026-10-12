-- =====================================================================
-- 0033_ministerio_imagen.sql
-- Imagen de fondo propia para el encabezado del detalle de un ministerio.
--
-- QUÉ
-- ---
-- `ministerios.imagen_url`: la foto que va detrás del nombre en
-- `app/ministerio/[id].tsx`. Null = la acuarela de la iglesia, la misma del
-- detalle de discipulado (components/FondoEncabezado.tsx). No reemplaza a
-- `icono`: el ícono sigue identificando al ministerio en las listas.
--
-- QUIÉN LA SUBE
-- -------------
-- Cualquier líder del ministerio, igual que el resto de su identidad (nombre,
-- descripción, ícono — `min_lider_update`, 0024). Por eso no alcanza con el
-- bucket `adjuntos` tal como lo dejó 0007, donde escribe solo el admin: un
-- líder de ministerio puede ser un `miembro` común.
--
-- Se abre la escritura del bucket ACOTADA A UNA CARPETA:
-- `adjuntos/ministerios/<ministerio_id>/...`, y solo para quien lidera ESE
-- ministerio (`es_lider_de_ministerio`, que es pertenencia al conjunto, no
-- igualdad contra un dueño). El resto del bucket sigue siendo solo del admin.
-- El nombre del archivo sigue siendo un UUID (lib/storage.ts), así que la URL
-- tampoco se adivina.
--
-- El bucket es público por diseño (0007): la imagen de un ministerio es
-- información de la congregación, como un flyer. Nada sensible va acá.
-- =====================================================================

alter table ministerios
  add column if not exists imagen_url text;

-- La URL tiene que apuntar a la carpeta del propio ministerio en el bucket.
-- Sin esto, un líder podría guardar cualquier https:// y cada persona que abra
-- el ministerio le pediría esa imagen a un servidor ajeno (y le dejaría su IP).
-- El dominio no se fija porque la base no conoce el suyo propio.
alter table ministerios drop constraint if exists ministerios_imagen_url_propia;
alter table ministerios add constraint ministerios_imagen_url_propia check (
  imagen_url is null
  or imagen_url ~ ('^https://[^/]+/storage/v1/object/public/adjuntos/ministerios/'
                   || id::text || '/[^/]+$')
);

comment on column ministerios.imagen_url is
  'Fondo del encabezado del detalle. URL pública de adjuntos/ministerios/<id>/. Null = fondo por defecto.';

-- ===== Storage: el líder escribe en la carpeta de SU ministerio =====
-- `storage.foldername(name)` parte el path: [1] = 'ministerios', [2] = el id.
-- El `case` garantiza que el cast a uuid solo corra sobre algo con forma de
-- uuid: un path cualquiera tiene que dar "no", no un error de cast.
create or replace function public.lidera_carpeta_de_ministerio(p_name text)
returns boolean language sql stable set search_path = public as $$
  select case
    when (storage.foldername(p_name))[1] = 'ministerios'
     and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then es_lider_de_ministerio(((storage.foldername(p_name))[2])::uuid)
    else false
  end;
$$;

grant execute on function public.lidera_carpeta_de_ministerio(text) to authenticated;

-- Insertar y borrar (reemplazar la imagen borra la anterior). UPDATE no: la app
-- sube siempre con nombre nuevo (`upsert: false`).
drop policy if exists "adjuntos_ministerio_insert" on storage.objects;
create policy "adjuntos_ministerio_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'adjuntos' and public.lidera_carpeta_de_ministerio(name));

drop policy if exists "adjuntos_ministerio_delete" on storage.objects;
create policy "adjuntos_ministerio_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'adjuntos' and public.lidera_carpeta_de_ministerio(name));
