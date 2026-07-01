-- =====================================================================
-- 0002_rls.sql — Row Level Security: funciones auxiliares + policies
-- =====================================================================

-- ===== Funciones auxiliares (security definer para evitar recursión) =====
create or replace function public.es_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin');
$$;

create or replace function public.es_discipulador_de(p_discipulado uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from discipulados
    where id = p_discipulado and discipulador_id = auth.uid()
  );
$$;

-- ===== PROFILES =====
alter table profiles enable row level security;
-- cada quien lee su propio perfil; admin lee todos
create policy prof_select on profiles for select
  using (id = auth.uid() or es_admin());
-- cada quien actualiza su propio perfil (no el rol -> ver nota); admin todo
create policy prof_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy prof_admin on profiles for all
  using (es_admin()) with check (es_admin());

-- ===== DISCIPULADOS: el líder ve/edita el suyo; admin todo =====
alter table discipulados enable row level security;
create policy disc_select on discipulados for select
  using (es_admin() or discipulador_id = auth.uid());
create policy disc_admin on discipulados for all
  using (es_admin()) with check (es_admin());

-- ===== PARTICIPACIONES: el líder del grupo gestiona los suyos; admin todo =====
alter table participaciones enable row level security;
create policy part_all on participaciones for all
  using (es_admin() or es_discipulador_de(discipulado_id))
  with check (es_admin() or es_discipulador_de(discipulado_id));

-- ===== REUNIONES: solo el líder del grupo (o admin) =====
alter table reuniones enable row level security;
create policy reu_all on reuniones for all
  using (es_admin() or es_discipulador_de(discipulado_id))
  with check (es_admin() or es_discipulador_de(discipulado_id));

-- ===== ASISTENCIAS: heredan el permiso de la reunión asociada =====
alter table asistencias enable row level security;
create policy asis_all on asistencias for all
  using (
    es_admin() or es_discipulador_de(
      (select discipulado_id from reuniones where id = reunion_id)
    )
  )
  with check (
    es_admin() or es_discipulador_de(
      (select discipulado_id from reuniones where id = reunion_id)
    )
  );

-- ===== EVENTOS: visibles para autenticados mientras estén vigentes; admin escribe =====
alter table eventos enable row level security;
create policy ev_select on eventos for select
  using (es_admin() or fecha_fin >= now());
create policy ev_write on eventos for all
  using (es_admin()) with check (es_admin());

-- ===== MIEMBROS: lectura para autenticados, escritura para admin o líder =====
-- (necesario para sumar un discípulo nuevo desde la pantalla de asistencia)
alter table miembros enable row level security;
create policy miembros_select on miembros for select
  using (auth.role() = 'authenticated');
create policy miembros_write on miembros for all
  using (es_admin() or auth.role() = 'authenticated')
  with check (es_admin() or auth.role() = 'authenticated');
