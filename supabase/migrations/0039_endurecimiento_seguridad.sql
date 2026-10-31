-- =====================================================================
-- 0039_endurecimiento_seguridad.sql
-- Cinco hallazgos de la revisión de seguridad del 2026-10-25 (docs/SECURITY.md
-- #14-#18). Todos alcanzables por REST con la anon key y una sesión común; en
-- ninguno la UI ofrece el camino, pero la base lo dejaba abierto.
--
--   A. #14 `username` sale del email de login, no de los metadatos del signup.
--   B. #15 `anuncios.autor_id` lo fija la base en el alta (+ firma del padrón).
--   C. #16 bucket `adjuntos`: límite de tamaño y de tipos en el servidor.
--   D. #17 la ofrenda no puede ser negativa.
--   E. #18 `participaciones` y `ministerio_miembros` dejan de ser `for all`.
--
-- Depende de 0007 (bucket adjuntos), 0013 (handle_new_user), 0024, 0025,
-- 0026/0037 (trigger de autor de anuncios) y 0038 (anuncios_visibles).
-- =====================================================================


-- ===== A. #14 — username derivado del email sintético =====
-- 0013 copiaba `raw_user_meta_data->>'username'`, que arma el cliente. Llamando
-- a `signUp` a mano se podía entrar con un email cualquiera y declarar como
-- username el TELÉFONO DE OTRA PERSONA: aprobaciones.tsx lo muestra como la
-- identidad de la cuenta y `candidatos_para_perfil` (0018) le da similitud 1.0
-- a la ficha de esa persona. Si el obrero aprobaba, el atacante quedaba
-- enlazado a la ficha ajena (mis_datos, guardar_mis_datos, mi_grupo). Y como
-- `username` es unique, el dueño real del teléfono ya no podía registrarse.
--
-- El cliente arma email y username con la MISMA normalización
-- (lib/authIdentity.ts: `<normalizeIdentifier(id)>@u.appchurch.app`), así que
-- la parte local del email ES el username que manda la app: para ella no
-- cambia nada. Lo que cambia es que ya no se puede declarar uno distinto.
-- Una cuenta con email real (alta desde el dashboard, bootstrap del primer
-- admin) queda sin username en vez de con el que diga el metadato.
--
-- `nombre_completo` sigue saliendo del metadato: es lo que la persona tipea y
-- no hay otra fuente. No es autoridad — al aprobar, el nombre que vale es el
-- de la ficha del padrón (0018/0027).
--
-- Cuentas ya creadas: no se tocan (un backfill podría chocar contra el unique).
-- Para ver si alguna declaró un username distinto de su email:
--   select p.id, p.rol, p.username, u.email
--   from profiles p join auth.users u on u.id = p.id
--   where p.username is distinct from
--         case when lower(u.email) like '%@u.appchurch.app'
--              then split_part(lower(u.email), '@', 1) end;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  insert into public.profiles (id, nombre_completo, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    case when lower(new.email) like '%@u.appchurch.app'
         then split_part(lower(new.email), '@', 1)
    end
  );
  return new;
end;
$function$;


-- ===== B. #15 — el autor del anuncio lo pone la base =====
-- `autor_id default auth.uid()` (0026) solo aplica si el cliente NO manda la
-- columna, y `trg_anuncios_conserva_autor` corre en UPDATE. Un líder de
-- ministerio podía insertar con `autor_id` = el pastor o un admin y el anuncio
-- salía firmado por esa persona.
--
-- Mismo guard que 0010/0022: con `auth.uid() is null` (SQL Editor,
-- service_role) se respeta lo que venga. El upsert de edición del cliente
-- (lib/queries/anuncios.ts) también dispara este trigger en el intento de
-- insert, pero al chocar por id va por el DO UPDATE, que no incluye
-- `autor_id` y además lo congela el trigger de 0026/0037.
create or replace function public.anuncios_fija_autor()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_anuncios_fija_autor on anuncios;
create trigger trg_anuncios_fija_autor
  before insert on anuncios
  for each row execute function public.anuncios_fija_autor();

-- La firma vuelve a salir del padrón. 0038 recreó `anuncios_visibles` con el
-- `p.nombre_completo` de 0026 y deshizo lo que 0027 había arreglado: ese es el
-- nombre que la persona tipeó al registrarse — cualquier texto, "Pastor Juan"
-- incluido. Idéntica a 0038 salvo esa columna; misma forma del resultado, así
-- que alcanza con `create or replace`.
create or replace function public.anuncios_visibles(
  p_incluir_vencidos boolean default false
)
returns table (
  id                 uuid,
  ministerio_id      uuid,
  ministerio_nombre  text,
  titulo             text,
  cuerpo             text,
  tipo               text,
  audiencia          text,
  autor_id           uuid,
  autor              text,
  fijado             boolean,
  vence_el           date,
  created_at         timestamptz
)
language sql security definer set search_path = public stable as $$
  select a.id, a.ministerio_id, m.nombre, a.titulo, a.cuerpo, a.tipo, a.audiencia,
         a.autor_id, nombre_de_perfil(a.autor_id), a.fijado, a.vence_el, a.created_at
  from anuncios a
  left join ministerios m on m.id = a.ministerio_id
  where es_miembro_activo()
    and (coalesce(p_incluir_vencidos, false) or a.vence_el is null or a.vence_el >= current_date)
    and (
      case
        when a.ministerio_id is null then true
        else es_admin()
             or es_lider_de_ministerio(a.ministerio_id)
             or (a.audiencia = 'integrantes' and participo_del_ministerio(a.ministerio_id))
      end
    )
  order by a.fijado desc, a.created_at desc;
$$;

grant execute on function public.anuncios_visibles(boolean) to authenticated;


-- ===== C. #16 — límites del bucket `adjuntos` en el servidor =====
-- El tope de 5 MB y el filtro `image/*` vivían solo en el cliente
-- (lib/storage.ts). Desde 0033 cualquier líder de ministerio —que puede ser un
-- `miembro` raso— escribe en `ministerios/<id>/` de un bucket PÚBLICO: sin
-- límite del lado del servidor, se podía subir cualquier archivo de cualquier
-- tamaño y usar el proyecto como hosting.
--
-- 10 MB: holgado para un flyer en PDF; la imagen de ministerio sigue cortada a
-- 5 MB por el cliente. Tipos: lo que eligen los selectores (imágenes y PDF),
-- con lista explícita y no `image/*`, para dejar afuera `image/svg+xml` (un SVG
-- servido desde un bucket público puede llevar script). HEIC/HEIF están para no
-- rechazar fotos de iPhone.
update storage.buckets
   set file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'image/heic', 'image/heif', 'application/pdf'
       ]
 where id = 'adjuntos';


-- ===== D. #17 — la ofrenda no puede ser negativa =====
-- 0036 valida el desglose presencial/virtual, pero el camino sin desglose
-- (`p_ofrenda`, el que usan las apps viejas) guardaba cualquier número: un
-- líder podía restarle a los totales del reporte de ofrendas.
--
-- Va como CHECK en las dos tablas y no dentro de los RPC: así cubre los dos
-- libros a la vez sin tocar los espejos `registrar_reunion` /
-- `registrar_reunion_ministerio`, y cualquier camino de escritura futuro.
--
-- `not valid`: rige para toda fila nueva o editada, sin fallar la migración si
-- ya hay negativos cargados. Para revisarlos y después validar:
--   select 'reuniones' as libro, id, fecha, ofrenda_total from reuniones where ofrenda_total < 0
--   union all
--   select 'ministerio', id, fecha, ofrenda_total from reuniones_ministerio where ofrenda_total < 0;
--   alter table reuniones            validate constraint reuniones_ofrenda_no_negativa;
--   alter table reuniones_ministerio validate constraint reuniones_ministerio_ofrenda_no_negativa;
alter table reuniones drop constraint if exists reuniones_ofrenda_no_negativa;
alter table reuniones add constraint reuniones_ofrenda_no_negativa
  check (ofrenda_total >= 0) not valid;

alter table reuniones_ministerio drop constraint if exists reuniones_ministerio_ofrenda_no_negativa;
alter table reuniones_ministerio add constraint reuniones_ministerio_ofrenda_no_negativa
  check (ofrenda_total >= 0) not valid;


-- ===== E. #18 — los rosters sin DELETE por REST =====
-- `part_all` (0002) y `minmiem_all` (0024) son `for all`: el permiso de
-- gestionar el roster incluía el DELETE físico, aunque la app solo hace baja
-- lógica (`activo = false`, lib/queries/participaciones.ts y ministerios.ts).
-- Mismo patrón que #12 / 0032.
--
-- Se separan por operación con los MISMOS `using`/`with check`: select, insert
-- y update (el upsert de "sumar" necesita los tres). Sin policy de delete para
-- nadie, como en 0031/0032. El cascade al borrar un grupo, un ministerio o una
-- ficha del padrón no pasa por RLS y sigue funcionando.
drop policy if exists part_all    on participaciones;
drop policy if exists part_select on participaciones;
drop policy if exists part_insert on participaciones;
drop policy if exists part_update on participaciones;
create policy part_select on participaciones for select
  using (es_admin() or es_discipulador_de(discipulado_id));
create policy part_insert on participaciones for insert
  with check (es_admin() or es_discipulador_de(discipulado_id));
create policy part_update on participaciones for update
  using (es_admin() or es_discipulador_de(discipulado_id))
  with check (es_admin() or es_discipulador_de(discipulado_id));

drop policy if exists minmiem_all    on ministerio_miembros;
drop policy if exists minmiem_select on ministerio_miembros;
drop policy if exists minmiem_insert on ministerio_miembros;
drop policy if exists minmiem_update on ministerio_miembros;
create policy minmiem_select on ministerio_miembros for select
  using (es_admin() or es_lider_de_ministerio(ministerio_id));
create policy minmiem_insert on ministerio_miembros for insert
  with check (es_admin() or es_lider_de_ministerio(ministerio_id));
create policy minmiem_update on ministerio_miembros for update
  using (es_admin() or es_lider_de_ministerio(ministerio_id))
  with check (es_admin() or es_lider_de_ministerio(ministerio_id));
