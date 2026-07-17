# Actividades vs. Eventos — modelo y decisiones

> Documento de referencia. Fija la distinción entre **actividad** (recurrente) y
> **evento** (único) y anota las decisiones aún pendientes.
> Estado: creado 2026-07-13.

## La distinción

| | **Actividad** | **Evento** |
|---|---|---|
| Qué es | Reunión **recurrente semanal** | Reunión/actividad **única** |
| Cuándo | Uno o más días de la semana + horario fijo | Fecha concreta, con inicio y fin |
| Vigencia | Indefinida, hasta marcarse **inactiva** | Hasta que pasa su `fecha_fin` |
| Ejemplo | Reunión de oración, **martes 20h** | Adoración especial, **vie 25/7 17–20h** |
| Tabla | `actividades` (nueva, `0015`) | `eventos` (existente) |

> **Nota de vocabulario**: hasta ahora el código usaba "actividad" para lo que hoy
> llamamos **evento** (la tabla `eventos`, el tab, `admin/eventos.tsx`). Con esta
> feature se separan los dos conceptos y se ajustan los textos de UI. El tab pasa a
> ser **"Eventos y actividades"** y muestra ambos, identificados.

## Modelo de datos (`actividades`)

- `dias_semana smallint[]` — una actividad puede repetirse en **varios días**
  (ej. martes y jueves). Convención `0=domingo … 6=sábado` (igual que
  `discipulados.dia_semana`).
- `hora_inicio` / `hora_fin` — **mismo horario para todos sus días**. Si una
  actividad necesitara horarios distintos por día, se modela como dos actividades
  o, más adelante, con una tabla hija `actividad_horarios` (ver diferidos).
- `modalidad` + `enlace_virtual` — presencial/virtual/ambos (reusa el enum).
- `adjunto_url` / `adjunto_tipo` — flyer opcional en el bucket público `adjuntos`
  (el mismo de eventos).
- `activa boolean` — baja lógica; una actividad inactiva desaparece del feed y del
  calendario pero se conserva.

Los **discipulados** siguen siendo una entidad **aparte** (grupo con roster, líder
y asistencia), aunque también sean recurrentes. No se fusionan con `actividades`.

## Superficie en la app

- **Feed** (`app/(tabs)/actividades.tsx`): dos secciones — "Actividades semanales"
  y "Próximos eventos" — cada ítem con su distintivo.
- **Calendario**: los eventos caen en su fecha; las actividades se pintan
  **repetidas cada semana** en su(s) día(s).
- **Detalle**: `/actividad-semanal/[id]` (recurrente) y `/actividad/[id]` (evento).
- **ABM admin**: `app/admin/actividades.tsx` (recurrentes) y `app/admin/eventos.tsx`
  (eventos). Hoy ambos **solo admin** (ver diferido #8).

---

## Decisiones DIFERIDAS (anotadas para retomar)

Estos puntos se dejaron pendientes a propósito; hay que definirlos antes de
construir la parte "asistencia/ofrendas" de las actividades.

### #5 — Alcance / audiencia
¿Una actividad es **siempre de toda la iglesia**, o puede acotarse a un grupo,
ministerio o audiencia (jóvenes, mujeres, un discipulado)? Hoy: **todas generales**
(no hay columna de audiencia). Si se acota, sumar `audiencia`/`discipulado_id` +
lógica de visibilidad en RLS y feed.

### #6 — Relación con discipulados
¿Un discipulado debería **aparecer también como actividad** recurrente, o quedan
separados? Hoy: **separados**. Los discipulados ya se muestran en el calendario por
su cuenta.

### #7 — Asistencia y ofrendas por ocurrencia
¿Una actividad necesita **registrar asistencia y/o recaudar ofrendas** por cada vez
que ocurre (como `reuniones` para discipulados)? Hoy: la actividad es **solo
informativa** (cuándo/dónde/qué). Si se quiere registro, hace falta una tabla de
**ocurrencias** (`actividad_id` + `fecha` + asistencias/ofrenda), análoga a
`reuniones`. Esto es lo que más peso tiene: reabre el modelo.

### #8 — Quién gestiona
¿Crean/editan actividades **solo admins**, o también **obreros** (por ejemplo, de
su ministerio)? Hoy: **solo admin** (policy `act_write = es_admin()`). Si se abre a
obreros, definir el scoping (¿todas? ¿solo las suyas?) y ajustar la RLS —el helper
`es_obrero()` ya existe (migración `0013`).

> Relación: estos puntos se cruzan con el modelo de roles de
> [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md) y [`PLAN-RED-IGLESIA.md`](./PLAN-RED-IGLESIA.md).
