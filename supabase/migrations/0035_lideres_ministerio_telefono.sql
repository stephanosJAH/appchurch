-- =====================================================================
-- 0035_lideres_ministerio_telefono.sql
-- La vista `ministerios_lideres` suma el teléfono de cada líder, para que
-- quien mira un ministerio pueda contactar a quienes lo llevan
-- (app/ministerio/[id].tsx, al tocar la pila de líderes).
--
-- El teléfono sale con la MISMA regla que en la vista `directorio` (0017,
-- 0020): solo si la persona lo permite (`mostrar_contacto`) y es adulta. Es
-- la misma audiencia (cualquier miembro activo), así que no abre nada que el
-- directorio no publique ya: un líder que apagó su contacto sigue sin
-- teléfono acá. Si la regla del directorio cambia, cambia acá también.
--
-- Se recrea entera (columna nueva). Mismo nombre, mismo gate por rol y
-- mismos grants que en 0027.
-- =====================================================================

drop view if exists public.ministerios_lideres;
create view public.ministerios_lideres with (security_invoker = false) as
  select ml.ministerio_id, ml.profile_id,
         coalesce(
           nullif(btrim(m.nombre || ' ' || coalesce(m.apellido, '')), ''),
           p.nombre_completo
         ) as nombre_completo,
         case
           when m.mostrar_contacto
            and m.fecha_nacimiento is not null
            and m.fecha_nacimiento <= (current_date - interval '18 years')::date
           then m.telefono
         end as telefono
  from public.ministerio_lideres ml
  join public.profiles p on p.id = ml.profile_id
  left join public.miembros m on m.id = p.miembro_id
  where public.es_miembro_activo();

revoke all on public.ministerios_lideres from anon;
grant select on public.ministerios_lideres to authenticated;
