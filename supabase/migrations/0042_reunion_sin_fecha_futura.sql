-- =====================================================================
-- 0042_reunion_sin_fecha_futura.sql
-- Una reunión no puede registrarse con fecha futura (los dos libros).
--
-- Contexto: ni el formulario (app/reunion/nueva.tsx) ni `registrar_reunion`
-- / `registrar_reunion_ministerio` limitaban la fecha. Una reunión "de la
-- semana que viene" con asistencia y ofrenda no describe nada que haya pasado:
-- ensucia el historial, el desglose de ofrendas y la grilla de asistencia
-- (las faltas seguidas se cuentan desde la reunión más nueva).
--
-- POR QUÉ UN TRIGGER Y NO UN CAMBIO EN LAS DOS RPC
-- ------------------------------------------------
-- Las dos RPC son espejos declarados y ya cargan cuatro versiones (0003, 0023,
-- 0025, 0036). Un trigger `before insert or update` en cada tabla pone la
-- misma regla en los dos libros sin reescribir los cuerpos, y la cubre aunque
-- algún día aparezca otro camino de escritura. Las dos funciones de trigger
-- son, a su vez, idénticas salvo el nombre: van juntas.
--
-- QUÉ SE CONTROLA
-- ---------------
-- * Solo cuando la fecha se escribe: en el alta o si la edición la cambia.
--   Una reunión vieja que ya hubiera quedado en el futuro se puede seguir
--   corrigiendo (tema, ofrenda, asistencia) sin que el trigger la trabe.
-- * Tolerancia de un día: `current_date` es la fecha del servidor (UTC en
--   Supabase) y el teléfono carga su fecha local. Con `+ 1` nunca se rechaza
--   el "hoy" de nadie, en ningún huso; el límite exacto lo pone el formulario
--   (`maximumDate` del selector + validación al guardar).
--
-- No se tocan `reuniones_obreros` ni `reuniones_generales` (0031/0041): no
-- tienen ofrenda ni grilla de asistencia y su formulario es otro.
-- =====================================================================

create or replace function public.reuniones_sin_fecha_futura()
returns trigger
language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.fecha is distinct from old.fecha)
     and new.fecha > current_date + 1 then
    raise exception 'La fecha de la reunión no puede ser futura';
  end if;
  return new;
end;
$$;

create or replace function public.reuniones_ministerio_sin_fecha_futura()
returns trigger
language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.fecha is distinct from old.fecha)
     and new.fecha > current_date + 1 then
    raise exception 'La fecha de la reunión no puede ser futura';
  end if;
  return new;
end;
$$;

drop trigger if exists reuniones_sin_fecha_futura on public.reuniones;
create trigger reuniones_sin_fecha_futura
  before insert or update of fecha on public.reuniones
  for each row execute function public.reuniones_sin_fecha_futura();

drop trigger if exists reuniones_ministerio_sin_fecha_futura on public.reuniones_ministerio;
create trigger reuniones_ministerio_sin_fecha_futura
  before insert or update of fecha on public.reuniones_ministerio
  for each row execute function public.reuniones_ministerio_sin_fecha_futura();
