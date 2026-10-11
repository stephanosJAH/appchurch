# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Mobile app for managing a church's discipleship groups (*discipulados*). Used by
leaders (*obreros*) and admins; regular members (*miembros*) get a read-only
"network" view (events, directory, birthdays). No public-facing signup flow —
accounts are approved by a human before they can do anything.

## Commands

```bash
npm start          # dev server — scan the QR with Expo Go 57
npm run android    # emulator/device
npm run ios        # simulator (macOS only)
npm run web        # web target
npm run build:apk  # eas build --platform android --profile preview
```

There is no lint or test script configured in `package.json` — don't invent one
to run. `tsconfig.json` has `strict: true`; use `tsc --noEmit` if you need a
type-check.

**Environment**: npm fails here on corporate TLS interception
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Use `npm install --strict-ssl=false`, or
export the corporate CA via `NODE_EXTRA_CA_CERTS` for a permanent fix.
Supabase credentials go in `.env` (copy `.env.example`), as
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Architecture

**Stack**: Expo Router (file-based routing) + Supabase (Postgres/Auth/RLS/Storage,
no custom backend) + TanStack Query (server state) + NativeWind v4/Tailwind v3
(styling).

```
app/
  (auth)/login.tsx          Login/registro (identificador sintético, no email real)
  (tabs)/                   Inicio, Calendario, Eventos y actividades, Perfil
  pendiente.tsx             Pantalla de espera para rol `pendiente`
  aprobaciones.tsx          Obrero/admin activa cuentas pendientes
  discipulado/[id].tsx      Resumen del grupo: próxima reunión, asistencia, avisos
  discipulado/discipulos.tsx  Roster: grilla de asistencia y alta (buscando en el padrón)
  discipulado/historial.tsx   Reuniones por mes, con ofrenda y asistencia
  ministerio/               Detalle, alta/edición y roster de un ministerio (área de la iglesia)
  anuncios.tsx              Avisos de la iglesia y de cada ministerio
  reunion/nueva.tsx         Registrar reunión (asistencia + ofrenda + tema), vía RPC.
                            Compartida por discipulados y ministerios (param `origen`)
  admin/                    ABM de miembros, discipulados, ministerios, eventos, actividades, usuarios (solo admin)
lib/
  supabase.ts               Cliente Supabase + LargeSecureStore (sesión cifrada)
  auth.tsx                  AuthProvider / useAuth (sesión + perfil + rol, vía React Query)
  authIdentity.ts            Normalización de identificador -> email sintético
  types.ts                  Tipos del dominio (reflejan supabase/migrations)
  theme.ts                  Colores/fuentes del design system
  queries/                  Un archivo de hooks TanStack Query por entidad
components/ui.tsx           Primitivos (Display/Headline/Title/Body, Button, Field, Card…)
supabase/migrations/        DDL + RLS + RPC + Storage, aplicar en orden numérico
```

### Authorization model — read `docs/ROLES-Y-PERMISOS.md` before touching auth/RLS

Roles (`rol_app`): `pendiente` (no aprobado, ve nada) → `miembro` (red: eventos,
directorio, cumpleaños) → `obrero` (líder; gestiona *sus* grupos/gente) →
`admin` (todo). **Power comes from assignment, not role name** —
`discipulados.discipulador_id = auth.uid()` is what grants an `obrero` access to
a group, not the `obrero` label itself.

Authorization lives in the backend (RLS policies + `security definer` RPCs),
never in the client. `isAdmin`/`esObrero` in `lib/auth.tsx` are for hiding/showing
UI only — do not treat them as a security boundary when writing queries or RPCs.

For **ministerios** `esObrero` isn't even the right UI gate: a ministry leader can
be a plain `miembro`, so asking about the role hides the screens from exactly the
person who has to manage them. Gate on `useMisMinisterios()` / `useSoyLiderDe(id)`
(backed by the `mis_ministerios()` RPC) instead. And because the permission is
**set membership** (`es_lider_de_ministerio()`), not equality against one owner,
every leader can do everything — including editing a meeting or announcement
someone else created. `registrado_por` / `autor_id` record who did it; they are
never part of a permission check. If you write `registrado_por = auth.uid()` into
a ministerio condition, it's a bug.

Activating a `pendiente` account is **identity resolution, not a role toggle**:
the RPC `resolver_identidad_pendiente` links the account to an existing padrón
record (via `candidatos_para_perfil`) or creates one; `profiles.miembro_id` is
`unique` and always set before activation. Don't write a direct
`update profiles set rol = 'miembro'` path.

### Auth without real email

Login accepts phone number or username, never a real email — most members don't
have one. `lib/authIdentity.ts` normalizes whatever the user types into a
synthetic `...@u.appchurch.app` address for Supabase's email/password provider.
This depends on **email confirmation being OFF** in the Supabase Auth dashboard
(intentional product decision, not a bug) — see `supabase/README.md`.

### Domain model: five separate "things", not one polymorphic one

- **`discipulados`** — a standing group with a roster, **one** leader, and tracked
  attendance/offerings per meeting (`reuniones` + `asistencias`, written via the
  transactional RPC `registrar_reunion`).
- **`ministerios`** — an area/department of the church (youth, worship, outreach)
  with **several equally-powered leaders** (`ministerio_lideres`), its own roster
  (`ministerio_miembros`) and its **own, deliberately separate accounting book**
  (`reuniones_ministerio` + `asistencias_ministerio`, via
  `registrar_reunion_ministerio`). No fixed day/time — a ministry that meets every
  week is an `actividad`.
- **`actividades`** — recurring weekly activity (e.g. "prayer meeting, Tuesdays
  8pm"), informative only, no attendance tracking. `dias_semana` is an array —
  one activity can repeat on multiple days with one shared time.
- **`eventos`** — one-off event with a concrete start/end date.
- **`reuniones_obreros`** — the leadership body's meeting: participants + a
  **minute of what was discussed** (`resumen`, rich text). **No owning group and
  no offering** — it is not a third ledger. Admin-only, reached from Perfil →
  Administración. Don't create an "Obreros" *ministerio* to host it: a ministerio
  is an *area* of the church, not the body that runs it. See
  `docs/REUNION-OBREROS.md` and the header of `0031`.

These are intentionally separate tables/screens, not a shared "activity" model.
See `docs/ACTIVIDADES-Y-EVENTOS.md` and `docs/MINISTERIOS.md` for the open design
questions before extending any of them (audience scoping,
attendance-per-occurrence, who can write them).

**`registrar_reunion` and `registrar_reunion_ministerio` are declared mirrors** —
the SQL is duplicated because the two ledgers are separate by product decision.
A fix to one goes into the other, always; both headers say so. The *UI* is not
duplicated: `reunion/nueva.tsx`, `reunion/[id].tsx` and `ofrendas.tsx` are shared
and branch on an `origen` param.

`registrar_reunion_obreros` (`0031`) is a **partial** mirror of those two: only
the attendance mechanics (additive insert on create, payload-is-final on edit)
are shared and must stay in sync across all three. Its body is otherwise its own
— no offering, no `modalidad`, admin-gated — and `app/admin/reuniones-obreros.tsx`
is a **separate screen on purpose**: `reunion/nueva.tsx` already carries 29
`esMinisterio` branches, and this form's fields differ, so a third `origen` would
make it three forms in one file.

`miembros` (full PII: email, notes) vs. the `directorio` view (safe subset:
name, birthday, phone — adults only, filtered by RLS) are different exposure
levels of the same person. Never widen what a query selects from `miembros`
without checking who can read it.

### Query layer convention

Each `lib/queries/<entity>.ts` exports `use<Entity>()` / `use<Entity>s()` query
hooks plus `useUpsert<Entity>()` / mutation hooks, with a `<entity>Keys` object
for query keys and explicit `invalidateQueries` on mutation success (see
`lib/queries/discipulados.ts` for the reference pattern, including
soft-delete/reactivate via `activo` + `refetchType: "all"` to also refresh
background tabs).

`lib/auth.tsx` keys the profile query by `session.user.id` and invalidates all
queries when the token transitions from absent to present — this works around a
cold-start race where queries fire before the restored Supabase session token is
attached, get cached empty by RLS, and never refetch within `staleTime` (see
`docs/BUGS.md` BUG-01 for the full incident).

### Session storage

`lib/supabase.ts` implements `LargeSecureStore`: a random AES-256 key lives in
SecureStore (Keychain/Keystore), the encrypted session blob lives in
AsyncStorage (SecureStore's ~2048-byte limit is too small for a full Supabase
session). Don't swap this back to a plain AsyncStorage adapter.

### Storage buckets

`adjuntos` (event/activity flyers) is **public by design** — read publicly,
write admin-only, paths use `Crypto.randomUUID()` for non-enumerability.
`materiales` (lesson docs, not yet used by any screen) is private, scoped to
`<uid>/...` folders. Any URL opened via `Linking` must go through
`abrirAdjunto()` in `lib/storage.ts`, which validates `https://` before opening.

### Design system ("Sacred Assembly")

Cream background, deep navy primary, gold/tertiary accents; serif
(Source Serif 4) for headings, sans (Source Sans 3) for body — see
`lib/theme.ts` for the exact tokens and `components/ui.tsx` for the typography
primitives (`Display`/`Headline`/`Title`/`Body`) and form/card components. Prefer
these over raw `Text`/`View` + Tailwind classes when a matching primitive exists.

**`Button` does not merge `className`.** `ButtonProps` extends `PressableProps`
and the component spreads `{...props}` *after* its own computed `className`, so
passing one **replaces** the whole class string and silently strips the
background, padding and rounding — the button renders as bare text. It
type-checks fine, so `tsc` won't catch it. Put layout (`mb-*`, `flex-1`,
`self-start`) on a wrapping `View`, which is what every screen does.

## Reference docs

- `docs/SDD.md` — software design document: architecture, data model, security
  model, key flows, deployment and implementation status. Start here for the
  whole picture; each section points at the doc that owns the detail
- `docs/ROLES-Y-PERMISOS.md` — authoritative permissions matrix by role/resource
- `docs/SECURITY.md` — security review log; several findings are deliberately
  **deferred by product decision** (open registration, no email verification) —
  check `docs/SECURITY-DIFERIDOS.md` before treating those as bugs to fix
- `docs/ACTIVIDADES-Y-EVENTOS.md` — actividades/eventos data model + open questions
- `docs/REUNION-OBREROS.md` — reunión de obreros (`0031`): why it isn't a
  ministerio/actividad/third ledger, why it's admin-only for now, and what it
  defers (who "the body of obreros" is, the Sunday service, the `for all`
  policies on the two existing meeting tables)
- `docs/MINISTERIOS.md` — ministerios (areas/departments): data model,
  authorization, phases, and what shipped vs. what was designed. Phases A-C are
  implemented (`0024`-`0026`); push notifications (D) are out of scope
- `docs/BUGS.md` — known issues log, template included for new entries
- `supabase/README.md` — migration order and first-admin bootstrap steps
