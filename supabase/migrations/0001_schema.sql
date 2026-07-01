-- =====================================================================
-- 0001_schema.sql — Esquema base: enums + tablas
-- App de Discipulados (Iglesia)
-- =====================================================================

-- ===== ENUMS =====
create type sexo             as enum ('M', 'F');                 -- personas
create type sexo_discipulado as enum ('M', 'F', 'mixto');        -- grupos (mixto contemplado)
create type modalidad        as enum ('presencial', 'virtual', 'ambos');
create type rol_app          as enum ('admin', 'discipulador');
create type tipo_evento      as enum ('general', 'discipulado', 'otro');

-- ===== MIEMBROS (todas las personas; sin login) =====
create table miembros (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  apellido         text,
  sexo             sexo not null,
  fecha_nacimiento date,
  telefono         text,
  email            text,
  notas            text,
  created_at       timestamptz default now()
);

-- ===== PROFILES (usuarios con login: admins y discipuladores) =====
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  miembro_id      uuid references miembros(id) on delete set null, -- el líder también es un miembro
  rol             rol_app not null default 'discipulador',
  nombre_completo text,
  created_at      timestamptz default now()
);

-- ===== DISCIPULADOS (grupos recurrentes; 1 discipulador) =====
create table discipulados (
  id                 uuid primary key default gen_random_uuid(),
  discipulador_id    uuid references profiles(id),  -- 1:1 grupo->líder
  nombre             text,                            -- opcional
  descripcion_etaria text,                            -- "Jóvenes 18-25", no restrictivo
  sexo               sexo_discipulado not null,
  modalidad          modalidad not null default 'presencial',
  dia_semana         smallint not null check (dia_semana between 0 and 6), -- 0=domingo
  hora_inicio        time not null,
  hora_fin           time,
  ubicacion          text,
  enlace_virtual     text,
  activo             boolean not null default true,
  created_at         timestamptz default now()
);

-- ===== PARTICIPACIONES (los discípulos del grupo) =====
create table participaciones (
  id             uuid primary key default gen_random_uuid(),
  discipulado_id uuid not null references discipulados(id) on delete cascade,
  miembro_id     uuid not null references miembros(id) on delete cascade,
  activo         boolean not null default true,
  fecha_inicio   date default current_date,
  created_at     timestamptz default now(),
  unique (discipulado_id, miembro_id)
);

-- ===== REUNIONES (un encuentro concreto) =====
create table reuniones (
  id              uuid primary key default gen_random_uuid(),
  discipulado_id  uuid not null references discipulados(id) on delete cascade,
  fecha           date not null,
  tema            text,                       -- descripción libre de la lección dada
  material_url    text,                       -- documento opcional (Supabase Storage)
  modalidad_usada modalidad,
  ofrenda_total   numeric(12,2) default 0,    -- solo total por reunión
  notas           text,
  registrado_por  uuid references profiles(id),
  created_at      timestamptz default now(),
  unique (discipulado_id, fecha)
);

-- ===== ASISTENCIAS =====
create table asistencias (
  id          uuid primary key default gen_random_uuid(),
  reunion_id  uuid not null references reuniones(id) on delete cascade,
  miembro_id  uuid not null references miembros(id) on delete cascade,
  presente    boolean not null default true,
  modalidad   modalidad,                      -- vino presencial o virtual
  unique (reunion_id, miembro_id)
);

-- ===== EVENTOS / ACTIVIDADES =====
create table eventos (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descripcion    text,
  tipo           tipo_evento not null default 'general',
  discipulado_id uuid references discipulados(id),
  fecha_inicio   timestamptz not null,
  fecha_fin      timestamptz not null,         -- visible hasta acá
  ubicacion      text,
  creado_por     uuid references profiles(id),
  created_at     timestamptz default now()
);

-- ===== ÍNDICES auxiliares =====
create index idx_discipulados_discipulador on discipulados (discipulador_id);
create index idx_participaciones_discipulado on participaciones (discipulado_id);
create index idx_participaciones_miembro on participaciones (miembro_id);
create index idx_reuniones_discipulado on reuniones (discipulado_id);
create index idx_reuniones_fecha on reuniones (fecha);
create index idx_asistencias_reunion on asistencias (reunion_id);
create index idx_eventos_fecha_fin on eventos (fecha_fin);
