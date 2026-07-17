-- =====================================================================
-- 0017_directorio_solo_adultos.sql
-- El directorio deja afuera a los menores de edad.
--
-- Con el alcance nuevo (toda la congregación usa la app), `miembros` dejó
-- de ser el padrón adulto de los discipulados y pasa a ser el padrón
-- entero, menores incluidos. La vista de 0014 publicaba nombre, fecha de
-- nacimiento y teléfono de TODO el padrón a cualquier miembro activo: su
-- `where es_miembro_activo()` filtra según quién mira, no qué filas salen.
-- Acá se agrega el filtro por fila: solo mayores de 18 con fecha de
-- nacimiento cargada.
--
-- Sin `fecha_nacimiento` no hay cómo saber la edad, así que esas personas
-- NO aparecen (mejor un adulto ausente hasta que le carguen la fecha, que
-- un menor expuesto porque nadie se la cargó). Los menores siguen visibles
-- donde corresponde: para su discipulador y el admin, vía la RLS de
-- `miembros` (0014), que esta vista no toca.
-- Depende de 0014 (vista directorio, es_miembro_activo).
-- =====================================================================

drop view if exists public.directorio;
create view public.directorio with (security_invoker = false) as
  select id, nombre, apellido, sexo, fecha_nacimiento, telefono
  from public.miembros
  where public.es_miembro_activo()
    and fecha_nacimiento is not null
    and fecha_nacimiento <= (current_date - interval '18 years')::date;

-- drop + create pierde los grants: se reponen igual que en 0014.
revoke all on public.directorio from anon;
grant select on public.directorio to authenticated;
