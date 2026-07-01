-- =====================================================================
-- 0005_discipulador_unico.sql — Regla 1:1 discipulado <-> discipulador
-- Un discipulador lidera a lo sumo un grupo.
-- (unique permite múltiples NULL en Postgres: los grupos sin líder no chocan.)
-- =====================================================================

alter table discipulados
  add constraint discipulados_discipulador_unico unique (discipulador_id);
