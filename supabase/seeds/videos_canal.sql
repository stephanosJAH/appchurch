-- Siembra única de videos_canal (0030), generada el 2026-09-28.
--
-- NO es una migración: no la incluyas en el orden numérico ni la re-apliques
-- por costumbre. Es un arranque en frío del respaldo.
--
-- Por qué existe: `videos_canal` solo se llena con un fetch exitoso al RSS de
-- YouTube, y ese endpoint viene devolviendo 404 para todos los canales desde
-- antes de que la tabla existiera (ver SDD 6.6). Sin esto el respaldo arranca
-- vacío y la sección de predicaciones queda muda hasta que YouTube se acuerde
-- de arreglarlo. Los datos (id, título, descripción, fecha, vistas) salen de
-- la página pública del canal, que sí responde.
--
-- Corré esto una vez en el SQL Editor de Supabase. El SQL Editor corre como
-- postgres, así que entra directo a la tabla: `guardar_videos_canal` exige
-- `auth.uid()` de un admin y ahí no hay sesión.
--
-- Cuando el feed vuelva, el primer refresco de un admin reemplaza estas filas
-- por las del RSS y este archivo deja de tener sentido: borralo.
insert into videos_canal (id, titulo, descripcion, publicado, vistas, es_short) values
  ('0GaJcBuNz4w', 'LA IGLESIA ESPIRITUAL', 'Domingo 27/09/2026', '2026-09-27T18:17:05-07:00'::timestamptz, 20, false),
  ('laf3oiAd78g', 'TODO EN UNO', 'Marina Vázquez, Domingo 20-09-2026', '2026-09-20T17:14:53-07:00'::timestamptz, 117, false),
  ('fMFFG7icLk8', 'LA VOZ QUE ME GOBIERNA', 'Adriana Spies, Domingo 13-09-2026', '2026-09-13T15:56:57-07:00'::timestamptz, 229, false),
  ('pjniZYGgGs8', 'DE ADÁN A CRISTO', 'José Luis Vázquez, Domingo 06-09-2026', '2026-09-06T12:12:48-07:00'::timestamptz, 202, false),
  ('9Hwxm6NxphI', 'PROYECTO GENOMA', 'German Debelis, Domingo 30-08-2026', '2026-08-30T10:43:51-07:00'::timestamptz, 245, false),
  ('3crjgn7OjEw', 'EL DIOS DE LA CREACIÓN ', 'José Luis Vázquez, Domingo 30-08-2026', '2026-08-25T19:23:19-07:00'::timestamptz, 143, false),
  ('z9mB425yG8k', 'SCRAP CELESTIAL', 'Marina Vázquez, Domingo 16-08-2026', '2026-08-16T10:46:26-07:00'::timestamptz, 121, false),
  ('spBED7y3Gos', 'EL LUGAR DONDE DIOS DECIDIÓ VIVIR', 'Adriana Spies, Domingo 09-08-2026', '2026-08-09T11:00:26-07:00'::timestamptz, 271, false),
  ('lB31xjb2XzI', 'PUESTO LOS OJOS EN ÉL', 'José Olthof, Domingo 02-08-2026', '2026-08-02T13:28:58-07:00'::timestamptz, 133, false),
  ('89vARQmlecs', 'EL PLAN DE DIOS', 'José Luis Vázquez, Domingo 26-07-2026', '2026-07-26T18:28:55-07:00'::timestamptz, 83, false),
  ('eRCjQpGsPOI', 'SOMOS IGLESIA', 'José Luis Vázquez, Domingo 19-07-2026', '2026-07-22T17:02:03-07:00'::timestamptz, 56, false),
  ('04OWq1kAOd0', 'AL OBEDECER LA VERDAD', 'José Luis Vázquez, Domingo 12-07-2026', '2026-07-19T08:36:23-07:00'::timestamptz, 102, false),
  ('4BCSwhnE_YE', '¿QUÉ DIOS TE GOBIERNA?', 'Marina Vázquez, Domingo 05-07-2026', '2026-07-05T15:55:55-07:00'::timestamptz, 140, false),
  ('X-dCNwro08g', 'LOS DÍAS SON MALOS ', 'José Olthof, Domingo 28-06-2026', '2026-07-01T08:04:30-07:00'::timestamptz, 84, false),
  ('6WJDu3HcTi0', 'LA PIEDRA RECHAZADA', 'José Luis Vázquez, Domingo 21-06-2026', '2026-06-21T13:09:10-07:00'::timestamptz, 91, false)
on conflict (id) do update
  set titulo      = excluded.titulo,
      descripcion = excluded.descripcion,
      publicado   = excluded.publicado,
      vistas      = excluded.vistas,
      guardado_en = now();
