-- =====================================================================
-- 0009_miembros_write_scoped.sql
-- Hallazgo de seguridad #2 (CRÍTICA): la policy `miembros_write` (for all)
-- permitía a CUALQUIER autenticado modificar o borrar cualquier miembro:
--
--   create policy miembros_write on miembros for all
--     using (es_admin() or auth.role() = 'authenticated')
--     with check (es_admin() or auth.role() = 'authenticated');
--
-- El `auth.role() = 'authenticated'` hacía irrelevante es_admin(). Con
-- `on delete cascade` en participaciones y asistencias (0001_schema), un
-- DELETE arrastraba también el historial del miembro.
--
-- Se separa la escritura por operación:
--   * INSERT : autenticado. La creación real de miembros pasa por la RPC
--              agregar_discipulo (security definer, ya valida autorización);
--              además el upsert de edición necesita pasar el check de INSERT.
--   * UPDATE : admin, o el discipulador que gestiona a ese miembro (lo tiene
--              en algún grupo que lidera). Preserva la edición desde
--              miembro/[id].tsx (puedeEditar = isAdmin || esMiDiscipulo).
--   * DELETE : solo admin. Evita el borrado masivo del padrón con cascada.
--
-- NOTA: el SELECT de `miembros` sigue abierto a autenticados (hallazgo #1),
-- no abordado por decisión de producto (muchos miembros no tienen email; el
-- registro/login es sin verificación por correo).
-- =====================================================================

-- Helper security definer: ¿el usuario actual lidera algún grupo del miembro?
-- Mismo patrón que es_admin / es_discipulador_de (evita recursión de RLS y no
-- queda sujeto a las policies de participaciones/discipulados).
create or replace function public.es_discipulador_del_miembro(p_miembro uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from participaciones p
    join discipulados d on d.id = p.discipulado_id
    where p.miembro_id = p_miembro
      and d.discipulador_id = auth.uid()
  );
$$;

grant execute on function public.es_discipulador_del_miembro(uuid) to authenticated;

-- Reemplaza la policy `for all` por policies separadas por operación.
drop policy if exists miembros_write on miembros;

drop policy if exists miembros_insert on miembros;
create policy miembros_insert on miembros for insert
  with check (auth.role() = 'authenticated');

drop policy if exists miembros_update on miembros;
create policy miembros_update on miembros for update
  using (es_admin() or es_discipulador_del_miembro(id))
  with check (es_admin() or es_discipulador_del_miembro(id));

drop policy if exists miembros_delete on miembros;
create policy miembros_delete on miembros for delete
  using (es_admin());
