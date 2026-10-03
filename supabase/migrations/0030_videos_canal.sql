-- =====================================================================
-- 0030_videos_canal.sql
-- Respaldo local del feed de YouTube (predicaciones).
--
-- **Por qué**: el endpoint `youtube.com/feeds/videos.xml` viene devolviendo
-- 404 a intervalos durante 2026 — no es este canal ni esta app: el mismo 404
-- lo da el canal oficial de YouTube, y lo firma `Server: YouTube RSS Feeds
-- server`. Vuelve solo al rato, pero mientras dura la caída la sección de
-- predicaciones queda muda. Esta tabla guarda el último feed bueno para
-- seguir mostrando los videos durante esas caídas, y de paso evita pegarle al
-- RSS en cada arranque de la app.
--
-- **Semántica: espejo, no historial.** Cada refresco reemplaza el contenido
-- por el feed que acaba de llegar. El RSS trae solo los últimos 15, así que la
-- tabla queda en 15 filas y nunca acumula videos que YouTube ya no lista
-- (borrados, privados). Consecuencia buscada: una fila basura no sobrevive al
-- próximo refresco exitoso.
--
-- **Qué NO se guarda**: ni la URL del video ni la de la miniatura. Las dos se
-- derivan del id en el cliente (`lib/youtube.ts`), que es lo mismo que hace el
-- parser del XML: de acá salen un `Linking.openURL` y un `<Image>`, y esos no
-- se arman con una cadena guardada. Por eso el id, además, tiene un `check`
-- con el formato real de YouTube.
-- =====================================================================

create table if not exists videos_canal (
  id          text primary key,
  titulo      text not null,
  descripcion text not null default '',
  publicado   timestamptz not null,
  vistas      integer,
  -- El feed no marca el tipo: se deduce de que el <link> apunte a /shorts/.
  -- Se guarda crudo y filtra el cliente, igual que con el feed en vivo.
  es_short    boolean not null default false,
  guardado_en timestamptz not null default now(),
  constraint videos_canal_id_youtube check (id ~ '^[A-Za-z0-9_-]{11}$')
);

create index if not exists idx_videos_canal_publicado on videos_canal (publicado desc);

comment on table videos_canal is
  'Espejo del último feed RSS bueno del canal. Lectura: todo miembro activo. Escritura: solo guardar_videos_canal() (admin).';
comment on column videos_canal.guardado_en is
  'Cuándo se refrescó la fila. El cliente lo usa como TTL: si es reciente no vuelve a pedirle el feed a YouTube.';

-- =====================================================================
-- RLS
-- =====================================================================
-- Leer: cualquier miembro activo — es el mismo contenido público del canal,
-- pero la app no expone nada a un `pendiente`.
-- Escribir: NINGUNA policy. La tabla entra solo por la RPC de abajo, que es
-- `security definer` y corta por admin. Sin esto, cualquier cuenta podría
-- inyectar una fila y quedarse en pantalla — para toda la iglesia — justo
-- durante una caída del feed, que es cuando esta tabla se muestra.
alter table videos_canal enable row level security;

drop policy if exists vid_select on videos_canal;
create policy vid_select on videos_canal for select using (es_miembro_activo());

revoke all on public.videos_canal from anon;
revoke insert, update, delete on public.videos_canal from authenticated;
-- Explícito y no por privilegios por defecto: sin este grant la policy de
-- arriba no tendría a quién dejar pasar.
grant select on public.videos_canal to authenticated;

-- =====================================================================
-- RPC: guardar el feed que acaba de llegar
-- =====================================================================
-- La llama el cliente admin después de un fetch exitoso al RSS
-- (`lib/queries/contenido.ts`). Reemplaza el espejo en una sola transacción.
--
-- Solo admin a propósito, siguiendo el criterio de `anuncios` (0026): lo que
-- ve toda la congregación lo escribe un admin. El contenido de esta tabla es
-- contenido de iglesia aunque venga de un tercero, y nadie puede verificar
-- del lado del servidor que lo que subió un cliente sea de verdad el feed. El
-- costo es que el respaldo se refresca cuando un admin abre la app; para
-- predicaciones semanales alcanza. Si algún día no alcanza, el cambio es
-- `es_obrero()` acá — no una policy de escritura en la tabla.
create or replace function public.guardar_videos_canal(p_videos jsonb)
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  v_filas integer;
begin
  if not es_admin() then
    raise exception 'No autorizado para actualizar los videos del canal';
  end if;

  -- Un feed vacío no vacía el respaldo: "YouTube no devolvió nada" es
  -- justamente el caso en que estas filas son lo único que queda.
  if p_videos is null
     or jsonb_typeof(p_videos) <> 'array'
     or jsonb_array_length(p_videos) = 0 then
    return 0;
  end if;

  -- `not exists` y no `not in`: con un solo id nulo en el arreglo, el `not in`
  -- no borra ninguna fila y el espejo se queda con lo viejo pegado.
  delete from videos_canal v
  where not exists (
    select 1 from jsonb_array_elements(p_videos) e where e->>'id' = v.id
  );

  insert into videos_canal (id, titulo, descripcion, publicado, vistas, es_short, guardado_en)
  select e->>'id',
         left(coalesce(nullif(e->>'titulo', ''), 'Sin título'), 300),
         left(coalesce(e->>'descripcion', ''), 5000),
         (e->>'publicado')::timestamptz,
         nullif(e->>'vistas', '')::integer,
         coalesce((e->>'es_short')::boolean, false),
         now()
  from jsonb_array_elements(p_videos) e
  -- Mismo filtro que el parser del cliente. El XML es contenido remoto que no
  -- controlamos: lo que no tenga forma de video de YouTube no entra.
  where e->>'id' ~ '^[A-Za-z0-9_-]{11}$'
    and e->>'publicado' is not null
  on conflict (id) do update
    set titulo      = excluded.titulo,
        descripcion = excluded.descripcion,
        publicado   = excluded.publicado,
        vistas      = excluded.vistas,
        es_short    = excluded.es_short,
        guardado_en = now();

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$function$;

revoke execute on function public.guardar_videos_canal(jsonb) from public, anon;
grant execute on function public.guardar_videos_canal(jsonb) to authenticated;
