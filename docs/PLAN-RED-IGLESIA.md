# Plan — App para toda la iglesia: roles, aprobación, directorio y login sin email

> Documento de trabajo. Plan de implementación aprobado.
> Estado: creado 2026-07-13. Stack: Expo SDK 54 + Supabase (seguridad vía RLS).
> Relacionado: [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md) (hallazgos #1 y #8).

## Context

Hoy la app es una herramienta de gestión donde **solo líderes** se loguean; los
`miembros` de la iglesia no tienen cuenta. Se decidió **extenderla a toda la
congregación** como una red interna (eventos, anuncios, cumpleaños, directorio),
con "obreros" (líderes/discipuladores) que tienen opciones de gestión y un perfil
`admin` que administra usuarios.

Esto reactiva el hallazgo de seguridad **#1 (CRÍTICA)** de
[`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md):
con toda la iglesia logueada, la policy actual `miembros_select` (abierta a
cualquier autenticado, `0002_rls.sql:73`) haría que **cada congregante pueda
descargar teléfono, email y notas pastorales de todos**. El registro también es
abierto y auto-asigna rol de gestión (`handle_new_user`, `0003_rpc.sql:84`;
default `discipulador`, `0001_schema.sql:31`).

Decisiones de producto ya tomadas con el usuario:
1. **Registro con aprobación**: cualquiera se registra pero queda **`pendiente`
   (sin acceso)** hasta que un obrero/admin lo activa a `miembro`.
2. **Directorio**: todo miembro ve **nombre + cumpleaños + teléfono**; email y
   notas quedan solo para los obreros de esa persona y admins.
3. **Login por usuario o teléfono** (sin email obligatorio), pensando en gente
   mayor.

Resultado buscado: el registro abierto deja de ser un agujero porque **una cuenta
nueva es inofensiva** (no ve nada) y el PII sensible queda detrás de rol +
pertenencia. Esto **resuelve el #1 por diseño** y encara el #8 sin depender del
email.

## Modelo de roles objetivo

`rol_app` pasa de `('admin','discipulador')` a **`('admin','obrero','miembro','pendiente')`**
(se renombra `discipulador`→`obrero`; los perfiles existentes migran solos).

| Rol | Ve | Puede |
|---|---|---|
| `pendiente` | **Nada** (pantalla "esperá aprobación") | Nada |
| `miembro` | Eventos, anuncios, cumpleaños, directorio (nombre+cumple+tel) | Nada de gestión |
| `obrero` | + PII completa (email/notas) **de su gente** | Gestionar sus grupos, activar pendientes |
| `admin` | Todo | Administrar usuarios y roles |

> Los poderes de gestión de un grupo siguen derivando de la **asignación**
> (`discipulados.discipulador_id = auth.uid()`, vía `es_discipulador_de`), no del
> nombre del rol. `obrero` es el tier que un admin asigna a los líderes.

---

## Fase 1 — Fundaciones de datos y seguridad (migraciones SQL)

### `supabase/migrations/0012_roles_expandidos.sql` (aislada por el gotcha de enums)
> `ALTER TYPE ... ADD VALUE` no puede **usarse** en la misma transacción en que se
> agrega; por eso va en su propio archivo, separado de 0013 que lo consume.
```sql
alter type rol_app rename value 'discipulador' to 'obrero';
alter type rol_app add value if not exists 'pendiente';
alter type rol_app add value if not exists 'miembro';
```

### `supabase/migrations/0013_registro_aprobacion.sql`
- `profiles`: `alter column rol set default 'pendiente'`; agregar columna
  `username text unique` (identificador legible para login usuario/teléfono).
- Reescribir `handle_new_user` (`0003_rpc.sql:84`) para copiar también
  `username` desde `raw_user_meta_data` (rol queda en el default `pendiente`).
- Helpers nuevos (mismo patrón security-definer que `es_admin`):
  - `es_obrero()` → `rol in ('obrero','admin')`.
  - `es_miembro_activo()` → `rol in ('miembro','obrero','admin')`.
- **Reemplazar** el trigger de `0010_no_autoescalar_rol.sql` por una versión
  matizada — permite que un obrero active pendientes, sin abrir auto-escalada:
  ```
  si new.rol <> old.rol:
    auth.uid() is null            -> permitir (bootstrap/servidor)
    es_admin()                    -> permitir (cualquier cambio)
    es_obrero() and old='pendiente' and new='miembro' and id<>auth.uid()
                                  -> permitir (activación)
    else                          -> raise 'No autorizado'
  ```
- Policies de `profiles` (se suman a las de `0002_rls.sql:19-28`):
  - `prof_obrero_ve_pendientes` (SELECT): `es_obrero() and rol='pendiente'`
    (para listar los que esperan aprobación).
  - `prof_obrero_activar` (UPDATE): `using es_obrero() and rol='pendiente'` /
    `with check es_obrero() and rol='miembro'`.

### `supabase/migrations/0014_directorio.sql`
- **Cerrar el SELECT del padrón** (#1 Parte B; el helper ya existe en 0009):
  ```sql
  drop policy if exists miembros_select on miembros;
  create policy miembros_select on miembros for select using (
    es_admin() or es_discipulador_del_miembro(id)
  );
  ```
- Endurecer INSERT a gestión (evita que un `miembro` cree filas sueltas; la
  creación real va por `agregar_discipulo`):
  ```sql
  drop policy if exists miembros_insert on miembros;
  create policy miembros_insert on miembros for insert
    with check (es_admin() or es_obrero());
  ```
- **Vista `directorio`** (columnas seguras, definer para exponer solo el subset,
  con gate por rol para que `pendiente` no vea nada):
  ```sql
  create or replace view public.directorio with (security_invoker = off) as
    select id, nombre, apellido, sexo, fecha_nacimiento, telefono
    from public.miembros
    where public.es_miembro_activo();
  revoke all on public.directorio from anon;
  grant select on public.directorio to authenticated;
  ```
  Resultado: `pendiente`→0 filas; `miembro`→nombre/apellido/sexo/cumple/tel;
  email y notas nunca salen por acá. Obrero/admin siguen leyendo el PII completo
  por la tabla base.

---

## Fase 2 — Auth por usuario/teléfono + fortaleza de contraseña

- **`lib/authIdentity.ts` (nuevo)**: `identifierToEmail(id)` normaliza usuario o
  teléfono → email sintético `"<slug>@u.appchurch.app"` (minúsculas, teléfono
  solo dígitos, sin espacios/@). Nadie ve ni necesita un correo real. Uniqueness
  la garantiza el email sintético en `auth.users`. **Importante**: el TLD debe ser
  real (no `.local`/`.test`/`.example`), o Supabase rechaza el signup con
  `email_address_invalid`; nada se envía porque la confirmación queda apagada.
- **`app/(auth)/login.tsx`**:
  - Reemplazar el campo "Correo electrónico" por "Usuario o teléfono"
    (sin `keyboardType="email-address"`).
  - Signup: pasar `identifierToEmail(id)` a `supabase.auth.signUp`, con
    `options.data: { nombre_completo, username: <normalizado> }`.
  - **Fortaleza de contraseña** (#8 Parte A): rechazar < 8 chars o puramente
    numérica antes de llamar a `signUp`, con mensaje claro.
  - Mantener la sesión post-signup (con confirmación off, `signUp` devuelve
    sesión → el usuario entra pero como `pendiente` y cae en la pantalla de
    espera). El fallback `signInWithPassword` (`login.tsx:44-51`) se conserva.
  - `forgotPassword`: mantener "contactá a un admin" (reset self-service se ve en
    Fase 5).
- **`lib/auth.tsx`**: exponer `rol` y derivados (`isAdmin`, `esObrero`,
  `aprobado = rol !== 'pendiente'`).
- **Gate de `pendiente`** en el shell (`app/_layout.tsx`): si hay sesión y
  `rol === 'pendiente'`, renderizar una pantalla "Tu cuenta está pendiente de
  aprobación" en lugar de las tabs.
- **`lib/types.ts`**: `RolApp = "admin" | "obrero" | "miembro" | "pendiente"`;
  `Profile` suma `username: string | null`.

---

## Fase 3 — Aprobación de pendientes y gestión de roles

- **`lib/queries/profiles.ts`**: agregar `usePendientes()` (SELECT
  `rol='pendiente'`, visible a obrero/admin por la policy nueva),
  `useCandidatosParaPerfil()` (RPC `candidatos_para_perfil`) y
  `useResolverIdentidad()` (RPC `resolver_identidad_pendiente`). `useUpdateRol`
  sigue para que el admin asigne `obrero`/`admin`.
- **Pantalla de aprobación accesible a obreros** (no solo admin, que hoy vive en
  `app/admin/*`): `app/aprobaciones.tsx` — **la aprobación es la resolución de
  identidad, no un toggle** (0018): al tocar una cuenta pendiente, el obrero ve
  candidatos rankeados del padrón (`candidatos_para_perfil`) para enlazar, o
  carga una ficha nueva si de verdad no está. No hay camino para activar sin
  resolver — evita que la autoedición (`app/mis-datos.tsx`, 0016) duplique la
  ficha del padrón.
- **`app/admin/usuarios.tsx`**: selector de rol pasa a **Miembro / Obrero /
  Admin**; renombrar el botón "Discipulador"→"Obrero" y las comparaciones
  `p.rol === "discipulador"` → `"obrero"` (`usuarios.tsx:69,72`). Sumar la sección
  de pendientes también acá para el admin.
- Ajustes cosméticos por el rename: `app/discipulado/editar.tsx:189` muestra
  `{p.rol}` (mostrará "obrero"); sin cambios de lógica.

---

## Fase 4 — Superficie de red (directorio + cumpleaños)

- **`lib/queries/directorio.ts` (nuevo)**: `useDirectorio()` sobre
  `.from("directorio")`; tipo `DirectorioEntry` (id, nombre, apellido, sexo,
  fecha_nacimiento, telefono).
- **Migrar los consumidores del SELECT global** (romperían con la policy nueva):
  `app/(tabs)/index.tsx:112` y `app/(tabs)/calendario.tsx:48` pasan de
  `useMiembros()` a `useDirectorio()`. `app/admin/miembros.tsx` **queda igual**
  (admin ve el padrón completo con PII).
- **Feed de cumpleaños**: derivar de `directorio.fecha_nacimiento` (próximos por
  día/mes). Reutilizar la home / componentes UI existentes (`components/ui`).
- **Pantalla de directorio** para miembros (lista nombre + cumple + botón de
  contacto por teléfono), reutilizando `Card`/`Avatar`.

---

## Fase 5 — Follow-ups (fuera del MVP de esta tanda)

- **Anuncios**: tabla `anuncios` + RLS (miembro+ lee, obrero/admin escribe) +
  pantalla. Backbone parcial ya existe (`eventos`, `0001_schema.sql:88`).
- **Reset de contraseña por admin** (#8 Parte C): como no hay email, requiere una
  **Edge Function** con `service_role` que setee una contraseña temporal. MVP
  mantiene "contactá a un admin" manual.
- **Config de dashboard** (#8 Parte B): mínimo de longitud y HaveIBeenPwned (si se
  tiene acceso al dashboard).
- **Backoffice web** (decisión 2026-07-13: diferido): la gestión de usuarios se
  hace primero en la app móvil + Edge Functions (única fuente de la lógica
  privilegiada con `service_role`). Si la ergonomía admin lo pide, se evalúa
  después **empezando por Expo Web** (mismo código) antes de comprometer un
  Next.js dedicado.

---

## Cómo resuelve los hallazgos diferidos

| Hallazgo | Estado tras el plan |
|---|---|
| #1 Parte A (registro abierto) | **Resuelto por diseño**: `pendiente`+aprobación, sin email |
| #1 Parte B (SELECT del padrón) | **Resuelto**: `miembros_select` acotado + vista `directorio` |
| #8 Parte A (fortaleza contraseña) | **Resuelto**: validación en el signup |
| #8 Parte B (dashboard) | Follow-up (requiere acceso al dashboard) |
| #8 Parte C (reset) | Follow-up (Edge Function admin) / manual por ahora |

## Riesgos residuales / decisiones asumidas

- **Rename `discipulador`→`obrero`**: los perfiles actuales migran solos. Conviene
  revisar en `admin/usuarios` quiénes quedaron como obrero (el registro abierto
  viejo pudo crear algunos de más).
- **Gate = el obrero menos cuidadoso**: como cualquier obrero puede activar y todo
  miembro ve todos los teléfonos ("contacto público"), la fuerza del control
  depende de que los obreros solo activen a gente que reconocen. Se puede
  restringir la activación **solo a admin** si se prefiere más control.
- **Email sintético `@u.appchurch.app`**: TLD real (obligatorio: Supabase rechaza
  `.local`/`.test`/`.example`) pero nada se envía porque la confirmación de email
  está apagada. Sin reset por email (va por admin en Fase 5). Posible colisión
  usuario↔teléfono si un usuario elige un handle igual a un número (riesgo bajo).
- **Spam de pendientes**: el signup libre puede crear cuentas `pendiente` sin
  acceso; se puede sumar rate-limit más adelante.
- **`fecha_nacimiento` expone el año/edad**: si se prefiere, la vista puede
  publicar solo día/mes.

## Verificación (end-to-end)

1. Aplicar 0012→0013→0014 (Supabase CLI `db push` o SQL Editor, en orden).
2. **Registro**: crear cuenta nueva → cae en pantalla "pendiente", no ve tabs ni
   datos.
3. **Activación**: como obrero, aparece en pendientes → "Activar" → el usuario
   pasa a `miembro`, ve directorio (nombre+cumple+tel) pero **no** email/notas.
4. **Obrero**: ve PII completa (email/notas) solo de su gente; no de miembros que
   no lidera.
5. **Admin**: ve todo; promueve a `obrero`/`admin` desde `admin/usuarios`.
6. **Anti-escalada**: intentar `update profiles set rol='admin' where id=<yo>`
   como no-admin → bloqueado por el trigger.
7. **Login**: probar por usuario y por teléfono; contraseña < 8 o numérica pura
   se rechaza.
8. **Regresión UI**: `(tabs)/index` y `calendario` cargan bien (ya usan
   `directorio`, no `useMiembros`).
9. **API directa** (curl con anon key): cuenta `pendiente` → `GET /rest/v1/miembros`
   y `GET /rest/v1/directorio` devuelven **0 filas**; tras activarla, `directorio`
   devuelve el subset seguro y `miembros` sigue en 0 para el miembro común.
