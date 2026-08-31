-- =====================================================================
-- 0026_anuncios.sql
-- El "mensaje" a los integrantes (Fase C de docs/MINISTERIOS.md).
--
-- Esto es la tabla `anuncios` que PLAN-RED-IGLESIA.md dejó en Fase 5,
-- adelantada con una columna de alcance: `ministerio_id` null = toda la
-- iglesia, con uuid = solo esa gente. Sirve para las dos cosas de una vez en
-- lugar de dos tablas que se van a parecer.
--
-- **Decisión (2026-08-19): el aviso es in-app** (feed + badge). Funciona hoy en
-- Expo Go 54, sin dependencias nuevas. El push real al celular con la app
-- cerrada necesita salir de Expo Go a un development/preview build,
-- `expo-notifications`, una tabla de tokens por dispositivo y una Edge Function
-- — es una tanda propia, y el modelo de datos de acá no cambia cuando se haga:
-- se le cuelga encima.
--
-- Depende de 0024 (es_lider_de_ministerio / participo_del_ministerio) y 0013
-- (es_miembro_activo).
-- =====================================================================

create table anuncios (
  id            uuid primary key default gen_random_uuid(),
  ministerio_id uuid references ministerios(id) on delete cascade, -- null = toda la iglesia
  titulo        text not null,
  cuerpo        text not null,          -- admite marcas (lib/richText.ts)
  autor_id      uuid references profiles(id) default auth.uid(),
  fijado        boolean not null default false,
  vence_el      date,                   -- opcional: se cae solo del feed
  created_at    timestamptz default now()
);

create index idx_anuncios_created on anuncios (created_at desc);
create index idx_anuncios_min     on anuncios (ministerio_id);

comment on column anuncios.ministerio_id is
  'Alcance del anuncio: null = toda la congregación (solo admin lo publica); con uuid = solo los participantes y líderes de ese ministerio.';

-- ===== Badge de no leídos sin tabla de lecturas =====
-- Una marca de agua por cuenta: todo lo creado después de este timestamp está
-- sin leer. El cliente la escribe solo — `prof_update_self` (0002) ya lo
-- permite y el trigger `no_autoescalar_rol` (0010/0013) solo mira `rol` —, así
-- que no hace falta RPC. Una tabla de lecturas por anuncio daría "quién leyó
-- qué", que nadie pidió, a cambio de una fila por persona y por anuncio.
alter table profiles add column if not exists anuncios_leidos_hasta timestamptz;

comment on column profiles.anuncios_leidos_hasta is
  'Marca de agua de lectura de anuncios: lo creado después está sin leer. La escribe el propio cliente al abrir la pantalla de anuncios.';

-- =====================================================================
-- RLS
-- =====================================================================
-- Leer: el anuncio general lo ve todo miembro activo; el de ministerio, solo
-- su gente (líderes y participantes) y el admin.
-- Escribir: el general es del admin; el de ministerio, de CUALQUIER líder de
-- ese ministerio — incluido editar o borrar el que publicó otro (0024).
alter table anuncios enable row level security;

create policy anun_select on anuncios for select using (
  case
    when ministerio_id is null then es_miembro_activo()
    else es_admin()
         or es_lider_de_ministerio(ministerio_id)
         or participo_del_ministerio(ministerio_id)
  end
);

-- El `with check` corre sobre la fila NUEVA: un líder no puede publicar un
-- anuncio general (ministerio_id null cae en la rama es_admin()) ni mover uno
-- suyo a un ministerio que no lidera.
create policy anun_write on anuncios for all using (
  case
    when ministerio_id is null then es_admin()
    else es_admin() or es_lider_de_ministerio(ministerio_id)
  end
) with check (
  case
    when ministerio_id is null then es_admin()
    else es_admin() or es_lider_de_ministerio(ministerio_id)
  end
);

-- ===== El autor no se pisa cuando otro líder edita =====
-- Misma decisión que `registrado_por` en 0023/0025: `autor_id` es un dato
-- (quién lo escribió), no un candado. Como cualquier líder puede editar el
-- anuncio de otro, la columna se congela en el trigger en vez de confiar en
-- que el cliente no la mande.
create or replace function public.anuncios_conserva_autor()
returns trigger language plpgsql set search_path = public as $$
begin
  new.autor_id := old.autor_id;
  return new;
end;
$$;

drop trigger if exists trg_anuncios_conserva_autor on anuncios;
create trigger trg_anuncios_conserva_autor
  before update on anuncios
  for each row execute function public.anuncios_conserva_autor();

-- =====================================================================
-- Lectura con los nombres resueltos
-- =====================================================================
-- `autor_id` apunta a `profiles`, que por `prof_select` (0002) solo se lee a sí
-- mismo: sin esto, un anuncio mostraría un uuid como firma. Mismo motivo por el
-- que el roster de ministerio va por RPC (0024).
--
-- El filtro de vencidos vive acá y no en la policy: quien gestiona (admin o
-- líder) necesita poder ver y borrar un anuncio ya caído, y una policy que los
-- esconda se lo llevaría puesto también a él. `p_incluir_vencidos` es lo que
-- distingue el feed de la pantalla de gestión.
create or replace function public.anuncios_visibles(
  p_incluir_vencidos boolean default false
)
returns table (
  id                 uuid,
  ministerio_id      uuid,
  ministerio_nombre  text,
  titulo             text,
  cuerpo             text,
  autor_id           uuid,
  autor              text,
  fijado             boolean,
  vence_el           date,
  created_at         timestamptz
)
language sql security definer set search_path = public stable as $$
  select a.id, a.ministerio_id, m.nombre, a.titulo, a.cuerpo,
         a.autor_id, p.nombre_completo, a.fijado, a.vence_el, a.created_at
  from anuncios a
  left join ministerios m on m.id = a.ministerio_id
  left join profiles p on p.id = a.autor_id
  where es_miembro_activo()
    and (coalesce(p_incluir_vencidos, false) or a.vence_el is null or a.vence_el >= current_date)
    and (
      case
        when a.ministerio_id is null then true
        else es_admin()
             or es_lider_de_ministerio(a.ministerio_id)
             or participo_del_ministerio(a.ministerio_id)
      end
    )
  order by a.fijado desc, a.created_at desc;
$$;

grant execute on function public.anuncios_visibles(boolean) to authenticated;
