-- =====================================================================
-- 0032_reuniones_solo_lectura.sql
-- Cierra las policies `for all` de los dos libros de reuniones: pasan a ser
-- `for select` y nada más.
--
-- EL PROBLEMA
-- -----------
-- `reu_all` / `asis_all` (0002) y `reumin_all` / `asismin_all` (0025) se
-- crearon como `for all`, que cubre SELECT, INSERT, UPDATE y DELETE con la
-- misma condición. Como el `using` sólo pregunta "¿sos el discipulador del
-- grupo / líder del ministerio?", cualquiera que pasara ese filtro podía, con
-- el anon key y un cliente REST cualquiera:
--
--   * DELETE sobre `reuniones` — y `asistencias` cuelga con
--     `on delete cascade`, así que se iba la reunión con su asistencia entera;
--   * UPDATE de `ofrenda_total` sin pasar por el RPC, sin dejar rastro;
--   * UPDATE de `registrado_por`, la columna de auditoría que 0023 y 0025
--     declaran explícitamente como "no se pisa".
--
-- Eso contradecía lo que ya afirmaban `docs/ROLES-Y-PERMISOS.md` ("**Borrar no
-- existe** para nadie, ni admin") y `docs/SDD.md` §4.4. La UI nunca ofreció
-- borrar, así que la garantía era de la pantalla, no de la base: valía hasta
-- que alguien mirara el tráfico de la app y repitiera el request a mano.
--
-- POR QUÉ ALCANZA CON `for select`
-- --------------------------------
-- Las cuatro tablas no se escriben nunca desde el cliente. Todo pasa por RPC
-- `security definer`, que corre como su dueño y por lo tanto no mira la RLS:
--   * `registrar_reunion` (0003, redefinida en 0023:62)
--   * `registrar_reunion_ministerio` (0025)
-- Verificado del lado del cliente: en `lib/queries/reuniones.ts` y
-- `lib/queries/ministerios.ts` las cuatro tablas aparecen sólo con `.select()`
-- —ninguna con `.insert()`, `.update()`, `.upsert()` ni `.delete()`.
--
-- Al quitar las policies de escritura, el RPC queda como el ÚNICO camino, y
-- entonces "borrar no existe" y "`registrado_por` no se pisa" pasan a estar
-- garantizados por construcción en vez de por convención. Es el mismo criterio
-- con el que nacieron `reuniones_obreros` / `asistencias_obreros` (0031).
--
-- LOS `using` NO CAMBIAN. Quién puede LEER cada reunión queda exactamente
-- igual; lo único que se saca es el permiso de escribir. Ningún `select` de la
-- app cambia de resultado.
--
-- SI ALGÚN DÍA HACE FALTA ESCRIBIR DIRECTO desde el cliente, el camino correcto
-- es un RPC definer nuevo (o ampliar el que ya existe), NO devolverle el `for
-- all` a la tabla. Y si hay que poder borrar una reunión, que sea una RPC
-- explícita con su propia regla, no un efecto colateral de la policy de lectura.
--
-- Depende de 0002, 0014 (es_admin), 0024 (es_lider_de_ministerio) y 0025.
-- =====================================================================

-- ===== Discipulados: reuniones + asistencias =====

drop policy if exists reu_all on reuniones;
create policy reu_select on reuniones for select
  using (es_admin() or es_discipulador_de(discipulado_id));

-- Las asistencias heredan el permiso de la reunión asociada (igual que en 0002).
drop policy if exists asis_all on asistencias;
create policy asis_select on asistencias for select
  using (
    es_admin() or es_discipulador_de(
      (select discipulado_id from reuniones where id = reunion_id)
    )
  );

-- ===== Ministerios: reuniones + asistencias =====
-- Pertenencia al conjunto de líderes, no igualdad contra un dueño único.

drop policy if exists reumin_all on reuniones_ministerio;
create policy reumin_select on reuniones_ministerio for select
  using (es_admin() or es_lider_de_ministerio(ministerio_id));

drop policy if exists asismin_all on asistencias_ministerio;
create policy asismin_select on asistencias_ministerio for select
  using (
    es_admin() or es_lider_de_ministerio(
      (select ministerio_id from reuniones_ministerio where id = reunion_id)
    )
  );

comment on table reuniones is
  'Reuniones de discipulado. Sólo lectura por RLS (0032): la escritura va únicamente por el RPC definer registrar_reunion. Borrar no existe para nadie.';
comment on table reuniones_ministerio is
  'Reuniones de ministerio (libro contable separado del de discipulados, 0025). Sólo lectura por RLS (0032): la escritura va únicamente por el RPC definer registrar_reunion_ministerio. Borrar no existe para nadie.';
