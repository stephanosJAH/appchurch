-- =====================================================================
-- 0006_baja_logica_discipulado.sql — Baja lógica de discipulados
-- Guarda el motivo y la fecha de baja. La baja libera al discipulador
-- (discipulador_id -> null) para respetar el 1:1 con la unique constraint.
-- =====================================================================

alter table discipulados
  add column if not exists motivo_baja text,
  add column if not exists fecha_baja timestamptz;
