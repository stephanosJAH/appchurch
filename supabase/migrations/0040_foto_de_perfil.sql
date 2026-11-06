-- =====================================================================
-- 0040_foto_de_perfil.sql
-- Cada persona con cuenta aprobada puede subir su foto de perfil.
--
-- QUÉ
-- ---
-- `profiles.foto_path`: el path de la foto dentro del bucket `fotos_perfil`.
-- Null = la inicial del nombre, como hasta ahora (Avatar, components/ui.tsx).
-- La foto se ve en Perfil y, a través de la vista `directorio`, la ve el resto
-- de la congregación. Subirla es el consentimiento: no hay flag aparte como
-- `mostrar_contacto`, y quitarla la saca de todos lados.
--
-- La foto es de la CUENTA, no de la ficha del padrón: es algo que la persona
-- decide sobre sí misma, y la mayoría de las fichas no tiene cuenta.
--
-- POR QUÉ UN PATH Y NO UNA URL (como ministerios.imagen_url, 0033)
-- ----------------------------------------------------------------
-- Con una URL guardada, el check de 0033 no puede fijar el dominio: cualquier
-- miembro podría apuntar a `https://suyo/storage/v1/object/public/...` y cada
-- persona que abre el directorio le pediría esa imagen a un servidor ajeno (y le
-- dejaría su IP). Con un path, la URL la arma la app contra su propio proyecto
-- (`urlFotoPerfil`, lib/storage.ts) y ese vector no existe.
--
-- POR QUÉ UN BUCKET APARTE
-- ------------------------
-- 1. Escribe cualquier miembro activo, no un admin o un líder designado:
--    los límites de `adjuntos` (10 MB, PDF incluido, 0039) le quedarían grandes.
--    Acá solo entra un JPEG chico; la app recorta y comprime antes de subir.
-- 2. El bucket es público porque un avatar se pide por fila del directorio y una
--    URL firmada por foto rompería la caché de imágenes. Las URLs no se adivinan
--    (nombre UUID) y no se pueden listar: el SELECT de abajo es solo del dueño.
--    Quien tenga una URL puede abrirla sin sesión, igual que con `adjuntos`.
--
-- Las cuentas `pendiente` no pueden subir: el registro es abierto
-- (docs/SECURITY-DIFERIDOS.md) y sin este corte cualquiera que se registre
-- publicaría imágenes en un bucket público.
--
-- Depende de 0013 (es_miembro_activo), 0022 (forma de `directorio`) y 0029
-- (grants de UPDATE por columna en `profiles`).
-- =====================================================================

alter table public.profiles
  add column if not exists foto_path text;

-- El path tiene que estar en la carpeta de la propia cuenta y con la forma que
-- genera la app. Sin esto, alguien podría mostrar como suya la foto de otro.
alter table public.profiles drop constraint if exists profiles_foto_path_propia;
alter table public.profiles add constraint profiles_foto_path_propia check (
  foto_path is null
  or foto_path ~ ('^' || id::text || '/[0-9a-fA-F-]{36}\.jpg$')
);

comment on column public.profiles.foto_path is
  'Foto de perfil: path en el bucket fotos_perfil (<uid>/<uuid>.jpg). Null = la inicial del nombre.';

-- 0029 cerró `profiles` por columna: sin este grant el UPDATE daría
-- "permission denied". `prof_update_self` sigue acotando a la fila propia.
grant update (foto_path) on public.profiles to authenticated;

-- ===== Bucket =====
-- 1 MB holgado: la app sube un JPEG de 512x512 (lib/storage.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos_perfil', 'fotos_perfil', true, 1024 * 1024, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ===== Storage: cada uno en la carpeta de su uid =====
-- La lectura pública va por la URL pública, que no pasa por RLS. El SELECT es
-- solo para que el dueño liste y borre lo suyo (Storage lo exige para borrar).
-- INSERT y DELETE sin UPDATE: la app sube siempre con nombre nuevo.
-- DELETE y SELECT no piden cuenta activa: dar de baja el acceso de alguien no
-- le tiene que impedir retirar su foto.
drop policy if exists "fotos_perfil_select" on storage.objects;
create policy "fotos_perfil_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'fotos_perfil' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos_perfil_insert" on storage.objects;
create policy "fotos_perfil_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fotos_perfil'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.es_miembro_activo()
  );

drop policy if exists "fotos_perfil_delete" on storage.objects;
create policy "fotos_perfil_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'fotos_perfil' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Vista directorio: suma la foto =====
-- Idéntica a 0022 más `foto_path`, de la cuenta enlazada a la ficha (left join:
-- la mayoría de las fichas no tiene cuenta; `miembro_id` es unique, así que no
-- duplica filas). Los menores siguen afuera, con foto o sin ella. Agrega una
-- columna al final, así que alcanza con `create or replace`, que conserva los
-- grants.
create or replace view public.directorio with (security_invoker = false) as
  select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento,
         case when m.mostrar_contacto then m.telefono end as telefono,
         p.foto_path
  from public.miembros m
  left join public.profiles p on p.miembro_id = m.id
  where public.es_miembro_activo()
    and m.activo
    and m.fecha_nacimiento is not null
    and m.fecha_nacimiento <= (current_date - interval '18 years')::date;
