-- =====================================================================
-- 0038_anuncios_tipo_y_destinatarios.sql
-- Tres cosas que piden los anuncios de ministerio:
--
--   1. `ministerios.dia_semana` / `hora_inicio`: el día y horario en que se
--      reúne. Opcionales — hay ministerios sin cadencia fija —, y solo
--      informativos: no generan ocurrencias en el calendario ni validan la
--      fecha de `reuniones_ministerio`. Hoy lo usa el compositor de anuncios
--      para proponer el vencimiento ("hasta la próxima reunión"). Revierte en
--      parte la decisión de 0024 de no darle horario al ministerio.
--   2. `anuncios.tipo`: información, atención, recordatorio… Define el ícono y
--      el color de la tarjeta. Es texto con check y no enum para poder sumar
--      tipos sin `alter type` (el mapa tipo → ícono/color vive en el cliente,
--      lib/anuncios.ts).
--   3. `anuncios.audiencia`: a quién le llega un anuncio de ministerio —
--      todos sus integrantes o solo sus líderes. El corte es de LECTURA (RLS
--      + RPC), no de presentación: el anuncio "solo líderes" no le llega a un
--      participante ni por la tabla. Como el badge cuenta lo que devuelve
--      `anuncios_visibles`, avisar = poder leer.
--
-- Depende de 0024 (es_lider_de_ministerio / participo_del_ministerio) y 0026.
-- =====================================================================

-- ===== 1. Día y horario del ministerio =====
alter table ministerios
  add column if not exists dia_semana  smallint,   -- 0=domingo … 6=sábado (convención de discipulados)
  add column if not exists hora_inicio time;

alter table ministerios drop constraint if exists ministerios_dia_valido;
alter table ministerios add constraint ministerios_dia_valido
  check (dia_semana is null or dia_semana between 0 and 6);

-- Una hora sin día no dice cuándo es la reunión.
alter table ministerios drop constraint if exists ministerios_hora_con_dia;
alter table ministerios add constraint ministerios_hora_con_dia
  check (hora_inicio is null or dia_semana is not null);

comment on column ministerios.dia_semana is
  'Día en que se reúne (0=domingo). Opcional e informativo: lo usa el vencimiento por defecto de los anuncios.';

-- `min_lider_update` (0024) ya deja al líder escribir la fila entera: no hace
-- falta policy nueva para que corrija el horario de su ministerio.

-- ===== 2 y 3. Tipo y audiencia del anuncio =====
alter table anuncios
  add column if not exists tipo      text not null default 'informacion',
  add column if not exists audiencia text not null default 'integrantes';

alter table anuncios drop constraint if exists anuncios_tipo_valido;
alter table anuncios add constraint anuncios_tipo_valido check (
  tipo in ('informacion', 'atencion', 'recordatorio', 'urgente', 'cambio', 'oracion', 'celebracion')
);

-- "Solo líderes" es de un ministerio: el anuncio general es de toda la iglesia.
alter table anuncios drop constraint if exists anuncios_audiencia_valida;
alter table anuncios add constraint anuncios_audiencia_valida check (
  audiencia = 'integrantes' or (audiencia = 'lideres' and ministerio_id is not null)
);

comment on column anuncios.audiencia is
  'A quién le llega un anuncio de ministerio: integrantes (participantes y líderes) o lideres (solo los líderes). El general siempre es integrantes.';

-- ===== RLS de lectura con la audiencia =====
-- La escritura (`anun_write`) no cambia: cualquier líder publica para
-- cualquiera de las dos audiencias de su ministerio.
drop policy if exists anun_select on anuncios;
create policy anun_select on anuncios for select using (
  case
    when ministerio_id is null then es_miembro_activo()
    else es_admin()
         or es_lider_de_ministerio(ministerio_id)
         or (audiencia = 'integrantes' and participo_del_ministerio(ministerio_id))
  end
);

-- ===== RPC con las columnas nuevas =====
-- Cambia el `returns table`, así que hay que borrarla antes: `create or
-- replace` no deja cambiar la forma del resultado.
drop function if exists public.anuncios_visibles(boolean);

create function public.anuncios_visibles(
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
         a.autor_id, p.nombre_completo, a.fijado, a.vence_el, a.created_at
  from anuncios a
  left join ministerios m on m.id = a.ministerio_id
  left join profiles p on p.id = a.autor_id
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

-- ===== mis_ministerios() (0027): foto y horario =====
-- La tarjeta de "Mi discipulado" muestra la foto del ministerio (0033) y su
-- día/hora de reunión. Idéntica a la de 0027 salvo esas tres columnas; cambia
-- el `returns table`, así que se borra antes.
drop function if exists public.mis_ministerios();

create function public.mis_ministerios()
returns table (
  id          uuid,
  nombre      text,
  descripcion text,
  icono       text,
  imagen_url  text,
  dia_semana  smallint,
  hora_inicio time,
  soy_lider   boolean,
  lideres     text[],
  integrantes integer
)
language sql security definer set search_path = public stable as $$
  select
    m.id, m.nombre, m.descripcion, m.icono, m.imagen_url, m.dia_semana, m.hora_inicio,
    es_lider_de_ministerio(m.id) as soy_lider,
    -- array(subquery) devuelve '{}' si no hay líderes, nunca null.
    array(
      select coalesce(nombre_de_perfil(l.profile_id), 'Sin nombre')
      from ministerio_lideres l
      where l.ministerio_id = m.id
      order by 1
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

grant execute on function public.mis_ministerios() to authenticated;
