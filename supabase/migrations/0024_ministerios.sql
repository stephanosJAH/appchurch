-- =====================================================================
-- 0024_ministerios.sql
-- Ministerios: identidad, líderes y roster (Fase A de docs/MINISTERIOS.md).
--
-- Un ministerio es un ÁREA de la iglesia (jóvenes, alabanza, acción social):
-- varios líderes con las mismas atribuciones, gente que participa, reuniones
-- propias y anuncios para su gente. Es la cuarta "cosa" del dominio, junto a
-- `discipulados`, `actividades` y `eventos`; no reemplaza a ninguna.
--
-- Por qué no es un `discipulado` con un `tipo`: `dia_semana`, `hora_inicio` y
-- `sexo` son `not null` allá (acción social no tiene día fijo, y un ministerio
-- no es "de varones"), el líder es 1:1 (`discipulados_discipulador_unico`,
-- 0005) y aflojar esas columnas rompería a todos los consumidores que hoy
-- hacen `DIAS_SEMANA[d.dia_semana]` sin preguntar. Ver MINISTERIOS.md.
--
-- Autorización, principio de siempre: **el poder viene de la asignación, no
-- del rol**. Estar en `ministerio_lideres` es lo que habilita, igual que
-- `discipulados.discipulador_id`. Un líder de ministerio NO necesita ser
-- `obrero`: puede ser `miembro` y liderar. Y como el permiso es pertenencia a
-- un CONJUNTO y no una igualdad contra un dueño único, todo lo que puede hacer
-- un líder lo pueden hacer todos: registrar reuniones, editar las que cargó
-- otro, sumar o sacar integrantes, publicar anuncios. Ninguna condición de
-- permiso de este archivo (ni de 0025/0026) filtra por "quien lo creó".
--
-- Depende de 0013 (es_obrero / es_miembro_activo), 0014 (RLS de `miembros`,
-- que es justamente lo que obliga a que el roster vaya por RPC), 0018
-- (pg_trgm, profiles.miembro_id unique), 0020 (mostrar_contacto) y 0022
-- (miembros.activo).
-- =====================================================================

-- ===== Identidad del ministerio =====
create table ministerios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,                       -- admite marcas (lib/richText.ts)
  icono       text,                       -- nombre de ionicon, para la UI
  activo      boolean not null default true,
  motivo_baja text,
  fecha_baja  timestamptz,
  created_at  timestamptz default now()
);

-- Un solo "Jóvenes". Incluye a los inactivos a propósito: si el ministerio
-- volvió, se reactiva, no se crea al lado (mismo criterio que el padrón, 0022).
create unique index ministerios_nombre_unico on ministerios (lower(nombre));

comment on column ministerios.descripcion is
  'Texto con marcas (lib/richText.ts), igual que la descripción de eventos y actividades.';

-- ===== Líderes =====
-- Tabla y no columna porque un ministerio tiene VARIOS, y todos son
-- equivalentes: no hay "líder principal". Por eso tampoco hay una columna que
-- los ordene ni los distinga — cualquier jerarquía entre ellos vive fuera de
-- la app. Una persona puede liderar más de un ministerio (al revés que
-- discipulados, 0005).
-- Apunta a `profiles` y no a `miembros` porque es una cuestión de permisos: lo
-- que autoriza es la cuenta, no la ficha del padrón.
create table ministerio_lideres (
  ministerio_id uuid not null references ministerios(id) on delete cascade,
  profile_id    uuid not null references profiles(id)    on delete cascade,
  created_at    timestamptz default now(),
  primary key (ministerio_id, profile_id)
);

-- ===== Roster =====
-- Espejo de `participaciones`: va contra el PADRÓN, no contra las cuentas —
-- hay gente que participa del ministerio y no tiene login.
-- La baja es lógica (`activo = false`) y no un delete: la fila se queda para
-- poder resolver el nombre de quien figura en una reunión vieja y ya no está
-- en el roster (ver `integrantes_de_mi_ministerio` más abajo).
create table ministerio_miembros (
  id            uuid primary key default gen_random_uuid(),
  ministerio_id uuid not null references ministerios(id) on delete cascade,
  miembro_id    uuid not null references miembros(id)    on delete cascade,
  activo        boolean not null default true,
  fecha_inicio  date default current_date,
  created_at    timestamptz default now(),
  unique (ministerio_id, miembro_id)
);

create index idx_ministerio_lideres_profile  on ministerio_lideres (profile_id);
create index idx_ministerio_miembros_min     on ministerio_miembros (ministerio_id);
create index idx_ministerio_miembros_miembro on ministerio_miembros (miembro_id);

-- =====================================================================
-- Helpers de autorización (mismo patrón security definer que
-- `es_discipulador_de`, 0002: definer para no recursar contra la RLS de las
-- tablas que las propias policies consultan).
-- =====================================================================

-- Pertenencia al conjunto de líderes. NO es una comparación contra un dueño:
-- de acá sale, sin lógica extra, que todos los líderes puedan lo mismo.
create or replace function public.es_lider_de_ministerio(p_ministerio uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministerio_lideres
    where ministerio_id = p_ministerio and profile_id = auth.uid()
  );
$$;

-- auth.uid() -> profiles.miembro_id -> ministerio_miembros activo.
-- Devuelve false si la cuenta no tiene ficha del padrón enlazada (cuenta vieja,
-- previa a 0018): el join no matchea y no rompe nada.
create or replace function public.participo_del_ministerio(p_ministerio uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from ministerio_miembros mm
    join profiles p on p.miembro_id = mm.miembro_id
    where mm.ministerio_id = p_ministerio and mm.activo and p.id = auth.uid()
  );
$$;

grant execute on function public.es_lider_de_ministerio(uuid) to authenticated;
grant execute on function public.participo_del_ministerio(uuid) to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================

-- ===== ministerios: todos ven que existe; el líder edita; el admin manda =====
-- "Ver que el ministerio existe" es ✓ para todo miembro activo (la matriz de
-- MINISTERIOS.md): el ministerio es información pública de la congregación, a
-- diferencia del roster. El admin ve además los dados de baja, para el ABM.
alter table ministerios enable row level security;

create policy min_select on ministerios for select
  using (es_admin() or (es_miembro_activo() and activo));

create policy min_admin on ministerios for all
  using (es_admin()) with check (es_admin());

-- El líder corrige nombre, descripción e ícono de SU ministerio. La RLS es por
-- fila y no distingue columnas, así que la baja se corta con un trigger (mismo
-- patrón que `solo_admin_da_de_baja` para `miembros`, 0022).
create policy min_lider_update on ministerios for update
  using (es_lider_de_ministerio(id)) with check (es_lider_de_ministerio(id));

create or replace function public.solo_admin_baja_ministerio()
returns trigger language plpgsql set search_path = public as $$
begin
  -- `auth.uid() is null` = contexto de servidor (SQL Editor, service_role,
  -- migraciones), igual que en 0010/0022: por la API nadie llega sin sesión.
  if auth.uid() is null or es_admin() then
    return new;
  end if;
  if new.activo is distinct from old.activo
     or new.motivo_baja is distinct from old.motivo_baja
     or new.fecha_baja is distinct from old.fecha_baja then
    raise exception 'Solo un administrador puede dar de baja o reactivar un ministerio';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solo_admin_baja_ministerio on ministerios;
create trigger trg_solo_admin_baja_ministerio
  before update on ministerios
  for each row execute function public.solo_admin_baja_ministerio();

-- ===== ministerio_lideres: se ve, lo escribe solo el admin =====
-- Único punto donde los líderes NO son autosuficientes (decisión diferida #6
-- de MINISTERIOS.md): quién entra al conjunto lo decide el admin, para que un
-- líder no se vuelva administrador de hecho de su área sumando cuentas. Si se
-- abre, es sumar `or es_lider_de_ministerio(ministerio_id)` acá.
alter table ministerio_lideres enable row level security;

create policy minlid_select on ministerio_lideres for select
  using (es_miembro_activo());

create policy minlid_admin on ministerio_lideres for all
  using (es_admin()) with check (es_admin());

-- ===== ministerio_miembros: el roster es de gestión =====
-- Ni el participante ni el resto de la congregación lo ven (decisión diferida
-- #2). Cualquier líder del ministerio lo gestiona entero, como el admin.
alter table ministerio_miembros enable row level security;

create policy minmiem_all on ministerio_miembros for all
  using (es_admin() or es_lider_de_ministerio(ministerio_id))
  with check (es_admin() or es_lider_de_ministerio(ministerio_id));

-- ===== Quiénes lideran, con el nombre resuelto =====
-- `ministerio_lideres` guarda `profile_id`, pero `prof_select` (0002) solo deja
-- leer el perfil propio: sin esto, "ver quiénes lo lideran" mostraría uuids.
-- Misma jugada que la vista `directorio` (0014): security_invoker = false para
-- que corra como su dueño y exponga SOLO la columna segura (el nombre), con el
-- WHERE gateando por rol.
create view public.ministerios_lideres with (security_invoker = false) as
  select ml.ministerio_id, ml.profile_id, p.nombre_completo
  from public.ministerio_lideres ml
  join public.profiles p on p.id = ml.profile_id
  where public.es_miembro_activo();

revoke all on public.ministerios_lideres from anon;
grant select on public.ministerios_lideres to authenticated;

-- =====================================================================
-- RPCs
-- =====================================================================

-- ===== Los ministerios donde participo o lidero =====
-- Espejo de `mi_grupo()` (0019). Un participante no puede leer
-- `ministerio_miembros`, así que "cuáles son los míos" no se resuelve desde el
-- cliente. `soy_lider` es lo que la UI usa para gatear la gestión: preguntar
-- por el ROL no sirve, porque un líder de ministerio puede ser `miembro`.
-- `integrantes` (el tamaño del roster) llega null para quien no lidera: el
-- roster es de gestión y el conteo también.
create or replace function public.mis_ministerios()
returns table (
  id          uuid,
  nombre      text,
  descripcion text,
  icono       text,
  soy_lider   boolean,
  lideres     text[],
  integrantes integer
)
language sql security definer set search_path = public stable as $$
  select
    m.id, m.nombre, m.descripcion, m.icono,
    es_lider_de_ministerio(m.id) as soy_lider,
    -- array(subquery) devuelve '{}' si no hay líderes, nunca null.
    array(
      select coalesce(p.nombre_completo, 'Sin nombre')
      from ministerio_lideres l
      join profiles p on p.id = l.profile_id
      where l.ministerio_id = m.id
      order by p.nombre_completo
    ) as lideres,
    case when es_lider_de_ministerio(m.id) then (
      select count(*)::int from ministerio_miembros mm
      where mm.ministerio_id = m.id and mm.activo
    ) end as integrantes
  from ministerios m
  where es_miembro_activo()
    and m.activo
    and (es_lider_de_ministerio(m.id) or participo_del_ministerio(m.id))
  order by m.nombre;
$$;

-- ===== Roster del ministerio, para el líder =====
-- Va por RPC y no por un join contra `miembros` porque desde 0014 la RLS del
-- padrón solo deja leer al admin y al discipulador de esa persona: un líder de
-- jóvenes que sea `miembro` no vería un solo nombre. Y `directorio` NO sirve
-- como reemplazo: desde 0017 excluye a los menores de 18, justo la población
-- de adolescentes y jóvenes.
--
-- El corte: `miembro_id`, nombre, apellido y teléfono **según
-- `mostrar_contacto`** (0020). Sin email, sin notas y sin fecha de nacimiento —
-- el líder necesita pasar lista y llamar, no la ficha completa; para la ficha
-- está el discipulador de esa persona.
--
-- Devuelve TAMBIÉN a los dados de baja del roster (`activo = false`): son los
-- que figuran en reuniones viejas, y sin ellos el historial y el formulario de
-- edición mostrarían asistentes sin nombre. La UI filtra por `activo` para la
-- lista de gestión y usa el conjunto completo para resolver nombres.
create or replace function public.integrantes_de_mi_ministerio(p_ministerio uuid)
returns table (
  miembro_id uuid,
  nombre     text,
  apellido   text,
  telefono   text,
  activo     boolean
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not (es_admin() or es_lider_de_ministerio(p_ministerio)) then
    raise exception 'No autorizado: no liderás este ministerio';
  end if;

  return query
    select m.id, m.nombre, m.apellido,
           case when m.mostrar_contacto then m.telefono end,
           mm.activo
    from ministerio_miembros mm
    join miembros m on m.id = mm.miembro_id
    where mm.ministerio_id = p_ministerio
    order by m.nombre, m.apellido;
end;
$$;

-- ===== Buscar a quién sumar, sin abrir la RLS del padrón =====
-- Espejo de `candidatos_para_perfil` (0018): similitud pg_trgm sobre
-- nombre+apellido, teléfono enmascarado (últimos 4 dígitos) para reconocer sin
-- exponer el PII, y el teléfono como señal fuerte pero nunca como autoridad.
--
-- Excluye a quienes YA están activos en el roster; a los dados de baja los
-- deja aparecer, para poder volver a sumarlos. Excluye también a los dados de
-- baja del padrón (0022): sumar al ministerio a alguien que se fue de la
-- iglesia es un error de tipeo, no un caso de uso.
--
-- Exige al menos 2 caracteres: sin eso, la RPC sería un volcado paginado del
-- padrón completo para cualquier líder de ministerio.
create or replace function public.candidatos_para_ministerio(
  p_ministerio uuid,
  p_texto      text
)
returns table (
  id               uuid,
  nombre           text,
  apellido         text,
  telefono_parcial text,
  similitud        real
)
language plpgsql security definer set search_path = public stable as $$
declare
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_digitos text;
begin
  if not (es_admin() or es_lider_de_ministerio(p_ministerio)) then
    raise exception 'No autorizado: no liderás este ministerio';
  end if;

  if length(v_texto) < 2 then
    return;
  end if;

  v_digitos := nullif(regexp_replace(v_texto, '\D', '', 'g'), '');

  return query
    select
      m.id,
      m.nombre,
      m.apellido,
      case when m.telefono is null then null
           else repeat('•', greatest(length(regexp_replace(m.telefono, '\D', '', 'g')) - 4, 0))
                || right(regexp_replace(m.telefono, '\D', '', 'g'), 4)
      end as telefono_parcial,
      greatest(
        similarity(v_texto, coalesce(m.nombre, '') || ' ' || coalesce(m.apellido, '')),
        case when v_digitos is not null and length(v_digitos) >= 6 and m.telefono is not null
                  and right(regexp_replace(m.telefono, '\D', '', 'g'), 8) = right(v_digitos, 8)
             then 1.0
             else 0.0
        end
      ) as similitud
    from miembros m
    where m.activo
      and not exists (
        select 1 from ministerio_miembros mm
        where mm.ministerio_id = p_ministerio and mm.miembro_id = m.id and mm.activo
      )
    order by similitud desc, m.nombre
    limit 15;
end;
$$;

-- ===== Crear una ficha del padrón y sumarla al roster =====
-- Espejo de `agregar_discipulo` (0003), para la persona que todavía no existe
-- en `miembros`. Va por RPC porque `miembros_insert` (0014) exige
-- `es_admin() or es_obrero()`, y un líder de ministerio puede ser `miembro`.
--
-- Sumar a alguien que YA está en el padrón no necesita RPC: es un insert
-- directo sobre `ministerio_miembros`, que la policy del roster ya autoriza.
--
-- `email` y `fecha_nacimiento` quedan afuera a propósito, por el mismo corte
-- que hace `integrantes_de_mi_ministerio`: el líder no los ve, así que tampoco
-- los carga. La ficha completa la completa después el admin, el discipulador
-- de esa persona, o ella misma desde "Mis datos".
create or replace function public.agregar_integrante_ministerio(
  p_ministerio_id uuid,
  p_nombre        text,
  p_apellido      text default null,
  p_sexo          sexo default null,
  p_telefono      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_miembro_id uuid;
  v_nombre     text := btrim(coalesce(p_nombre, ''));
begin
  if not (es_admin() or es_lider_de_ministerio(p_ministerio_id)) then
    raise exception 'No autorizado: no liderás este ministerio';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_sexo is null then
    raise exception 'El sexo es obligatorio para crear la ficha';
  end if;

  insert into miembros (nombre, apellido, sexo, telefono)
  values (v_nombre, p_apellido, p_sexo, p_telefono)
  returning id into v_miembro_id;

  insert into ministerio_miembros (ministerio_id, miembro_id)
  values (p_ministerio_id, v_miembro_id)
  on conflict (ministerio_id, miembro_id) do update set activo = true;

  return v_miembro_id;
end;
$$;

grant execute on function public.mis_ministerios() to authenticated;
grant execute on function public.integrantes_de_mi_ministerio(uuid) to authenticated;
grant execute on function public.candidatos_para_ministerio(uuid, text) to authenticated;
grant execute on function public.agregar_integrante_ministerio(uuid, text, text, sexo, text) to authenticated;
