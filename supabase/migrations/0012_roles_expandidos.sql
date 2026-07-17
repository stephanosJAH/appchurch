-- =====================================================================
-- 0012_roles_expandidos.sql
-- Extiende la app a toda la congregación (ver docs/PLAN-RED-IGLESIA.md).
-- Amplía el enum de roles: renombra 'discipulador' -> 'obrero' (los perfiles
-- existentes migran solos: es el mismo valor del enum) y agrega 'pendiente'
-- y 'miembro'.
--
-- IMPORTANTE: un valor de enum recién agregado NO puede USARSE en la misma
-- transacción en que se agrega. Por eso esta migración SOLO toca el enum; el
-- uso de 'pendiente'/'miembro' (default de columna, policies, triggers) va en
-- 0013, en su propia transacción.
-- =====================================================================

alter type rol_app rename value 'discipulador' to 'obrero';
alter type rol_app add value if not exists 'pendiente';
alter type rol_app add value if not exists 'miembro';
