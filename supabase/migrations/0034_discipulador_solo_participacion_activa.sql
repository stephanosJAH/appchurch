-- =====================================================================
-- 0034_discipulador_solo_participacion_activa.sql
-- Hallazgo de seguridad (MEDIA, abierto desde la revisión del 2026-09-24):
-- `es_discipulador_del_miembro` (0009) no miraba `participaciones.activo`.
--
-- QUÉ PASABA
-- ----------
-- Sacar a alguien del grupo es una baja lógica (`participaciones.activo =
-- false`, lib/queries/participaciones.ts), así que la fila sigue existiendo y
-- el helper seguía diciendo que sí. El ex líder conservaba, sin límite de
-- tiempo, todo lo que cuelga de ese helper sobre la persona que ya no está en
-- su grupo:
--   * SELECT de la ficha completa en `miembros` (0014): teléfono, email,
--     fecha de nacimiento, notas pastorales.
--   * UPDATE de la ficha si no tiene cuenta (`miembros_update`, 0021).
--   * Escribir sus notas (`guardar_notas_miembro`, 0021).
-- "Su gente" (docs/ROLES-Y-PERMISOS.md) es la que está HOY en sus grupos.
--
-- QUÉ CAMBIA
-- ----------
-- 1. El helper exige `p.activo`. No cambia ninguna policy: todas lo llaman, y
--    el corte les llega a todas a la vez.
-- 2. `asistentes_de_reunion`: el nombre de quien figura en una reunión vieja.
--    El detalle y la edición de una reunión (app/reunion/[id].tsx,
--    app/reunion/nueva.tsx) embebían `miembros(*)` en las asistencias; con el
--    punto 1, quien ya salió del grupo pasaría a "Sin nombre" en su propio
--    historial — y al editar, una fila sin nombre que igual hay que mandar
--    (el payload es final: lo que no viaja se borra). La RPC devuelve SOLO
--    nombre y apellido, y SOLO de quienes tienen asistencia en esa reunión:
--    lo que ya figura en el acta, no la ficha. Es el mismo problema que
--    `integrantes_de_mi_ministerio` (0024) resolvió devolviendo también a los
--    dados de baja; acá el corte es más chico porque el líder de discipulado
--    sí lee la ficha de su gente activa por RLS.
--
-- Lo que NO cambia: `discipulados.activo`. Un grupo desactivado sigue dando
-- acceso a su gente activa; si eso también debe cortar es una decisión aparte
-- (al reactivar el grupo, la gente vuelve con él).
-- =====================================================================

create or replace function public.es_discipulador_del_miembro(p_miembro uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from participaciones p
    join discipulados d on d.id = p.discipulado_id
    where p.miembro_id = p_miembro
      and p.activo
      and d.discipulador_id = auth.uid()
  );
$$;

-- ===== Nombres de los asistentes de una reunión de discipulado =====
-- Mismo permiso que leer la reunión (`reu_select`, 0032): admin o el
-- discipulador del grupo. Sin permiso devuelve 0 filas en vez de fallar, igual
-- que la RLS de `reuniones` para quien no la puede ver.
create or replace function public.asistentes_de_reunion(p_reunion uuid)
returns table (
  miembro_id uuid,
  nombre     text,
  apellido   text
)
language sql security definer set search_path = public stable as $$
  select m.id, m.nombre, m.apellido
  from reuniones r
  join asistencias a on a.reunion_id = r.id
  join miembros m on m.id = a.miembro_id
  where r.id = p_reunion
    and (es_admin() or es_discipulador_de(r.discipulado_id));
$$;

revoke execute on function public.asistentes_de_reunion(uuid) from public, anon;
grant execute on function public.asistentes_de_reunion(uuid) to authenticated;
