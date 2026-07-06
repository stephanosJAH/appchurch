-- =====================================================================
-- 0008_discipulador_edita_su_grupo.sql
-- El discipulador puede EDITAR su propio grupo (nombre, horario, etc.).
-- Agregar/quitar discípulos ya estaba permitido por la policy part_all
-- (participaciones). Acá solo habilitamos el UPDATE del propio discipulado.
--
-- Restricciones vía with check:
--   * discipulador_id = auth.uid()  -> no puede reasignar/soltar el liderazgo.
--   * activo                        -> no puede dar de baja el grupo (eso es
--                                      exclusivo del admin, "zona de riesgo").
-- El admin sigue con acceso total por la policy disc_admin (for all).
-- =====================================================================

create policy disc_update_lider on discipulados for update
  using (discipulador_id = auth.uid())
  with check (discipulador_id = auth.uid() and activo);
