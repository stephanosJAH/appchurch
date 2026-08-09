-- =====================================================================
-- 0022_miembro_activo.sql
-- Baja lógica de personas del padrón: `miembros.activo`.
--
-- Contexto: la gente deja de venir, se muda o se va de la iglesia, y hasta
-- acá la única salida era borrar la ficha — que se lleva puesto el
-- historial (asistencias, participaciones, reuniones) por el `on delete
-- cascade` de 0001. El mismo problema que `discipulados` resolvió en su
-- momento con `activo` (0001) + motivo/fecha de baja (0006): la fila se
-- queda, deja de aparecer.
--
-- Alcance de la baja:
--   * Deja de salir en el `directorio` (y con eso en los cumpleaños del
--     inicio y del calendario, que leen esa misma vista).
--   * Sigue existiendo para admin y para el discipulador de su grupo — la
--     RLS de `miembros` (0014) no cambia. El historial queda intacto.
--   * NO toca la cuenta de la app: si esa persona tiene login, sigue
--     entrando. Dar de baja la ficha y bajarle el rol a la cuenta
--     (app/miembro/[id].tsx, `profiles.rol`) son dos decisiones distintas,
--     y mezclarlas dejaría al admin sin forma de hacer una sin la otra.
--
-- Quién puede: SOLO admin. El discipulador administra su gente (0009) pero
-- no decide quién forma parte de la congregación; la RLS de `miembros`
-- es por fila y no distingue columnas, así que el corte va por trigger,
-- igual que `no_autoescalar_rol` (0010).
--
-- Depende de 0014 (RLS de miembros, vista directorio), 0017 (filtro de
-- adultos) y 0020 (mostrar_contacto en la vista).
-- =====================================================================

alter table miembros
  add column if not exists activo boolean not null default true;

comment on column miembros.activo is
  'La persona forma parte de la congregación. En false queda dada de baja: sale del directorio y de los cumpleaños, pero conserva ficha e historial. Solo un admin puede cambiarlo (trg_solo_admin_da_de_baja).';

-- ===== Solo un admin da de baja o reactiva =====
-- Mismo patrón y mismo guard que 0010: con `auth.uid() is null` (SQL Editor,
-- service_role, migraciones) se permite, porque son contextos de servidor de
-- confianza y por la API nadie llega sin sesión — la RLS de `miembros` (0014)
-- ya exige es_admin() o es_discipulador_del_miembro().
--
-- El INSERT no falla: fuerza `activo = true`. Un alta es siempre alta, y así
-- los caminos definer que crean fichas para otros (agregar_discipulo de 0003,
-- resolver_identidad_pendiente de 0018, ambos llamables por un obrero) no
-- necesitan saber nada de esta columna.
create or replace function public.solo_admin_da_de_baja()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not es_admin() then
      new.activo := true;
    end if;
    return new;
  end if;

  if new.activo is distinct from old.activo
     and auth.uid() is not null
     and not es_admin() then
    raise exception 'Solo un administrador puede dar de baja o reactivar a una persona del padrón';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solo_admin_da_de_baja on miembros;
create trigger trg_solo_admin_da_de_baja
  before insert or update on miembros
  for each row execute function public.solo_admin_da_de_baja();

-- ===== Vista directorio: solo gente activa =====
-- Idéntica a 0020 (teléfono según `mostrar_contacto`, adultos con fecha de
-- nacimiento cargada) más el filtro de baja. Es la única superficie pública:
-- components/Directorio.tsx, los cumpleaños del inicio y los del calendario
-- salen todos de acá, así que con este `and activo` quedan los tres.
drop view if exists public.directorio;
create view public.directorio with (security_invoker = false) as
  select id, nombre, apellido, sexo, fecha_nacimiento,
         case when mostrar_contacto then telefono end as telefono
  from public.miembros
  where public.es_miembro_activo()
    and activo
    and fecha_nacimiento is not null
    and fecha_nacimiento <= (current_date - interval '18 years')::date;

-- drop + create pierde los grants: se reponen igual que en 0014/0017/0020.
revoke all on public.directorio from anon;
grant select on public.directorio to authenticated;

-- ===== Lo que a propósito NO se filtra =====
-- * `candidatos_para_perfil` (0018): la ficha de alguien dado de baja tiene
--   que seguir apareciendo al aprobar su cuenta. Si volvió a la iglesia y
--   se registra de nuevo, esconderla es exactamente cómo se genera la ficha
--   duplicada que esa RPC vino a evitar; el admin la reactiva y listo.
-- * `reuniones_de_mi_grupo` (0019): los presentes de una reunión pasada son
--   un hecho histórico. Sacarlos al darlos de baja reescribiría el registro.
-- * El roster de `participaciones`: es la vista de gestión del discipulador.
--   Que siga viendo a la persona (marcada) es preferible a que desaparezca
--   de su grupo sin aviso; la baja de la participación es un flag aparte.
