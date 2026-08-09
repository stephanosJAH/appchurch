-- =====================================================================
-- 0021_ficha_con_cuenta.sql
-- Cuando la persona tiene cuenta en la app, su ficha es suya: el
-- discipulador deja de editarle los datos y pasa a verlos como
-- información personal. Lo único que sigue escribiendo es `notas`, que
-- nunca fue un dato de la persona sino del seguimiento pastoral.
--
-- Contexto: el padrón `miembros` nació como la libreta del discipulador
-- (0009: el líder edita a su gente, cargada por él antes de que existiera
-- el login). Desde 0016/0018/0020 la persona también entra a la app y
-- autogestiona su ficha por `guardar_mis_datos`, acotada a `auth.uid()`.
-- Con los dos caminos abiertos sobre la misma fila, el discipulador podía
-- pisar lo que la persona acababa de corregir — incluido
-- `mostrar_contacto`, que es su consentimiento para publicar el teléfono —
-- sin que ninguno de los dos se enterara. En cuanto hay cuenta enlazada la
-- ficha tiene dueño, y es la persona.
--
-- Alcance:
--   * `miembros_update` (0009) se acota: el discipulador edita SOLO fichas
--     sin cuenta enlazada. El admin sigue pudiendo todo — es el ABM del
--     padrón (app/admin/miembros.tsx) y el que corrige cuando la persona
--     no puede hacerlo ella misma.
--   * `guardar_notas_miembro()`: camino nuevo para que el discipulador
--     siga escribiendo la descripción en fichas que ya no puede tocar.
--     Escribe esa columna y ninguna otra.
--
-- Lo que NO cambia: la lectura. El discipulador sigue viendo la PII
-- completa de su gente (teléfono, email, notas) — es el contacto pastoral,
-- y era ya el caso desde 0009/0014.
-- Depende de 0009 (es_discipulador_del_miembro, miembros_update) y 0018
-- (profiles.miembro_id unique).
-- =====================================================================

-- ===== ¿Esta ficha del padrón ya está enlazada a una cuenta? =====
-- Definer como el resto de los helpers (es_admin, es_discipulador_del_miembro):
-- `profiles` solo se lee a sí mismo por RLS (0002), así que un discipulador no
-- puede resolver esto por su cuenta. Devuelve el booleano del enlace y nada de
-- la cuenta (ni id, ni rol, ni username).
--
-- Lo llama la RLS de abajo y también el cliente (app/miembro/[id].tsx) para
-- saber qué mostrar. Exponerlo a `authenticated` agrega poco: el SELECT de
-- `miembros` ya está abierto a cualquier autenticado (hallazgo #1, diferido
-- por decisión de producto — ver docs/SECURITY-DIFERIDOS.md), y esto no
-- devuelve datos nuevos de nadie.
create or replace function public.miembro_tiene_cuenta(p_miembro uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where miembro_id = p_miembro);
$$;

grant execute on function public.miembro_tiene_cuenta(uuid) to authenticated;

-- ===== miembros: el discipulador edita solo fichas sin cuenta =====
-- Reemplaza la policy de 0009 sumando `not miembro_tiene_cuenta(id)` a la rama
-- del discipulador. El `with check` repite la condición para que tampoco pueda
-- enlazar/desenlazar por el costado moviendo la fila fuera de su alcance.
-- El upsert de PostgREST (INSERT ... ON CONFLICT DO UPDATE) cae en esta misma
-- policy al chocar con la fila existente, así que el camino viejo del cliente
-- queda cerrado aunque una app desactualizada lo intente.
drop policy if exists miembros_update on miembros;
create policy miembros_update on miembros for update
  using (
    es_admin()
    or (es_discipulador_del_miembro(id) and not miembro_tiene_cuenta(id))
  )
  with check (
    es_admin()
    or (es_discipulador_del_miembro(id) and not miembro_tiene_cuenta(id))
  );

-- ===== La descripción/nota pastoral sigue siendo del discipulador =====
-- Contracara de la policy: el discipulador perdió el UPDATE sobre la fila
-- completa, y `notas` es lo único que le seguía correspondiendo escribir.
-- Definer y acotada a esa columna — el mismo patrón, invertido, de
-- `guardar_mis_datos`, que edita los datos personales y nunca `notas`.
-- Vale para fichas con y sin cuenta: un solo camino para la descripción.
create or replace function public.guardar_notas_miembro(
  p_miembro uuid,
  p_notas   text
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (es_admin() or es_discipulador_del_miembro(p_miembro)) then
    raise exception 'No autorizado: esa persona no está en tus grupos';
  end if;

  update miembros set notas = v_notas where id = p_miembro;
  if not found then
    raise exception 'No existe esa persona en el padrón';
  end if;

  return v_notas;
end;
$$;

grant execute on function public.guardar_notas_miembro(uuid, text) to authenticated;
