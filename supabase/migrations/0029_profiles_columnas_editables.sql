-- =====================================================================
-- 0029_profiles_columnas_editables.sql
-- Hallazgo de seguridad #11 (ALTA): cada usuario puede reescribir su propio
-- `profiles.miembro_id`.
--
-- `prof_update_self` (0002) deja que cada quien actualice su fila de
-- `profiles` sin restringir columnas. El trigger de 0010/0013 solo cuida
-- `rol`; `miembro_id` quedó libre. Desde 0016-0027 ese campo es la llave de
-- casi todo lo "mío": `mis_datos`, `guardar_mis_datos`, `mi_grupo`,
-- `reuniones_de_mi_grupo`, `participo_del_ministerio` (anuncios y reuniones
-- de ministerio) y `miembro_tiene_cuenta`. Con el id de cualquier adulto
-- (sale de la vista `directorio`) un miembro hacía:
--   PATCH /rest/v1/profiles?id=eq.<su_uid>  {"miembro_id":"<uuid víctima>"}
-- y pasaba a leer y escribir la ficha de otra persona (email, fecha de
-- nacimiento, `mostrar_contacto`), ver su grupo y sus ministerios, y dejaba
-- a la persona real sin poder ser aprobada ("ya está enlazada").
--
-- Vector paralelo: `prof_obrero_activar` (0013) deja que un obrero haga un
-- UPDATE directo a un pendiente con {"rol":"miembro","miembro_id":<lo que
-- sea>}, salteando `resolver_identidad_pendiente` (0018) — justo el camino
-- que el modelo de identidad prohíbe.
--
-- Fix: grants de UPDATE por columna. Del cliente, `profiles` solo se
-- actualiza en dos columnas:
--   * `rol`                   -> useUpdateRol (admin). Lo sigue cuidando
--                                trg_no_autoescalar_rol (0010/0013).
--   * `anuncios_leidos_hasta` -> useMarcarAnunciosLeidos (0026).
-- `miembro_id` solo lo escriben RPCs security definer
-- (`resolver_identidad_pendiente`); su dueño no está sujeto a estos grants
-- ni a RLS, así que la aprobación sigue funcionando. `nombre_completo` y
-- `username` los carga el trigger de alta (0013, definer) y no los edita
-- ninguna pantalla: quedan cerrados también.
--
-- Nota: el grant por columna también acota al admin por la API (prof_admin).
-- Hoy no edita otra cosa que `rol`; cualquier corrección de `miembro_id`
-- por un admin va por SQL Editor o por una RPC nueva, nunca por UPDATE
-- directo.
-- =====================================================================

-- ===== Solo dos columnas editables desde la API =====
revoke update on public.profiles from anon, authenticated;
grant update (rol, anuncios_leidos_hasta) on public.profiles to authenticated;

-- ===== La activación de pendientes es solo por RPC =====
-- `resolver_identidad_pendiente` es definer: no necesita esta policy. El
-- trigger anti auto-escalada conserva su rama de obrero (pendiente ->
-- miembro, nunca sobre sí mismo) porque dentro de la RPC `auth.uid()` sigue
-- siendo el obrero.
drop policy if exists prof_obrero_activar on public.profiles;

-- ===== mis_datos(): exige cuenta activa, como guardar_mis_datos =====
-- Idéntica a 0020 salvo por `es_miembro_activo()`. Mismo tipo de retorno,
-- así que `create or replace` alcanza y conserva el grant.
create or replace function public.mis_datos()
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  sexo             sexo,
  fecha_nacimiento date,
  telefono         text,
  email            text,
  mostrar_contacto boolean
)
language sql security definer set search_path = public stable as $$
  select m.id, m.nombre, m.apellido, m.sexo, m.fecha_nacimiento, m.telefono,
         m.email, m.mostrar_contacto
  from miembros m
  join profiles p on p.miembro_id = m.id
  where p.id = auth.uid()
    and public.es_miembro_activo();
$$;

grant execute on function public.mis_datos() to authenticated;

-- ===== Datos ya contaminados =====
-- La migración no puede saber si algún `miembro_id` fue reescrito antes de
-- este cierre. Para revisarlo a mano en el SQL Editor: cuentas enlazadas
-- cuya ficha tiene un nombre muy distinto al del registro.
--   select p.id, p.username, p.nombre_completo,
--          m.nombre || ' ' || coalesce(m.apellido, '') as ficha
--   from profiles p join miembros m on m.id = p.miembro_id
--   where similarity(lower(p.nombre_completo),
--                    lower(m.nombre || ' ' || coalesce(m.apellido, ''))) < 0.3;
