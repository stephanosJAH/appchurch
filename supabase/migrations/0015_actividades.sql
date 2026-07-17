-- =====================================================================
-- 0015_actividades.sql — Actividades recurrentes semanales
--
-- Distinta de `eventos` (que son ÚNICOS, con fecha_inicio/fecha_fin):
-- una ACTIVIDAD es un ítem de agenda que se repite cada semana en uno o más
-- días, con horario fijo, vigente hasta que se marca inactiva. No tiene fecha
-- de calendario. Ej: "Reunión de oración, martes 20h".
--
-- Ver docs/ACTIVIDADES-Y-EVENTOS.md para el modelo y las decisiones diferidas
-- (alcance, asistencia/ofrendas, quién gestiona).
-- =====================================================================

create table actividades (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descripcion    text,
  dias_semana    smallint[] not null,          -- 0=domingo … 6=sábado (convención de discipulados)
  hora_inicio    time not null,
  hora_fin       time,
  ubicacion      text,
  modalidad      modalidad not null default 'presencial',
  enlace_virtual text,
  adjunto_url    text,                          -- flyer opcional (bucket público 'adjuntos', 0007)
  adjunto_tipo   text check (adjunto_tipo in ('imagen', 'pdf')),
  activa         boolean not null default true, -- baja lógica: inactiva -> fuera del feed/calendario
  creado_por     uuid references profiles(id),
  created_at     timestamptz default now(),
  -- Al menos un día, y todos en el rango 0..6.
  constraint dias_semana_no_vacio check (array_length(dias_semana, 1) >= 1),
  constraint dias_semana_validos check (dias_semana <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index idx_actividades_activa on actividades (activa);

-- ===== RLS =====
-- Lectura: cualquier autenticado ve las activas; el admin ve todas (incl.
--   inactivas, para gestión). Mismo criterio que `eventos` (0002): el gate de
--   `pendiente` para contenido no sensible es a nivel de UI, no de RLS.
-- Escritura: solo admin. Que un obrero pueda gestionar actividades es una
--   decisión diferida (#8 en docs/ACTIVIDADES-Y-EVENTOS.md); si se abre, usar
--   el helper es_obrero() (0013) con el scoping que se defina.
alter table actividades enable row level security;

create policy act_select on actividades for select
  using (public.es_admin() or activa);

create policy act_write on actividades for all
  using (public.es_admin())
  with check (public.es_admin());
