# SDD — Documento de Diseño de Software

**Proyecto**: appchurch — "pdapp" · App de discipulados y red de la iglesia
**Versión del documento**: 1.0 · **Fecha**: 2026-08-30
**Estado del sistema**: en producción interna (distribución APK vía EAS `preview`)

> **Qué es este documento.** La vista de conjunto del diseño: qué construimos, con
> qué piezas, por qué está partido así y qué invariantes lo sostienen. Es un
> documento **derivado** — la verdad de cada tema vive en el código y en los docs
> específicos, que se citan en cada sección. Cuando este documento y una migración
> se contradigan, gana la migración.
>
> **Documentos de referencia**: [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md) ·
> [`ACTIVIDADES-Y-EVENTOS.md`](./ACTIVIDADES-Y-EVENTOS.md) ·
> [`MINISTERIOS.md`](./MINISTERIOS.md) · [`PLAN-RED-IGLESIA.md`](./PLAN-RED-IGLESIA.md) ·
> [`SECURITY.md`](./SECURITY.md) · [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md) ·
> [`SECURITY-REVISION-RED.md`](./SECURITY-REVISION-RED.md) ·
> [`WEB-APP-IOS.md`](./WEB-APP-IOS.md) · [`BUGS.md`](./BUGS.md) ·
> [`supabase/README.md`](../supabase/README.md)

---

## Índice

1. [Propósito y alcance](#1-propósito-y-alcance)
2. [Contexto del sistema](#2-contexto-del-sistema)
3. [Arquitectura](#3-arquitectura)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Modelo de seguridad y autorización](#5-modelo-de-seguridad-y-autorización)
6. [Diseño del cliente móvil](#6-diseño-del-cliente-móvil)
7. [Flujos principales](#7-flujos-principales)
8. [Build, entornos y despliegue](#8-build-entornos-y-despliegue)
9. [Calidad, observabilidad y limitaciones](#9-calidad-observabilidad-y-limitaciones)
10. [Estado de implementación y evolución](#10-estado-de-implementación-y-evolución)
11. [Apéndices](#11-apéndices)

---

## 1. Propósito y alcance

### 1.1 Problema

Una iglesia organiza su vida en **grupos de discipulado**: reuniones semanales con
un líder fijo, un roster de discípulos, asistencia y ofrenda por encuentro. Ese
registro se llevaba a mano, disperso y sin consolidar. Al mismo tiempo, la
congregación entera necesita un canal común: qué pasa esta semana, quién cumple
años, cómo contactar a alguien, dónde ver la última predicación.

La app resuelve las dos cosas con **una sola base de personas** y niveles de
acceso distintos sobre ella.

### 1.2 Objetivos de diseño

| # | Objetivo | Cómo se materializa |
|---|---|---|
| O1 | Que el registro de reuniones sea confiable y no se pueda romper a medias | RPC transaccional `registrar_reunion` (reunión + asistencias + ofrenda en una llamada) |
| O2 | Que el PII quede en capas y no se filtre por descuido del cliente | Autorización 100% en Postgres (RLS + `security definer`), nunca en la app |
| O3 | Que entre gente sin correo electrónico | Identificador sintético (`lib/authIdentity.ts`): login por teléfono o usuario |
| O4 | Que una cuenta recién creada sea inofensiva | Rol `pendiente` por defecto; activar = resolver identidad contra el padrón |
| O5 | Que corra en el dispositivo de cualquiera sin build nativo | Expo SDK 57 / Expo Go 57; ninguna dependencia fuera del runtime de Expo Go |
| O6 | Que no haya un backend que mantener | Supabase como única infraestructura (Postgres + Auth + Storage) |

### 1.3 Fuera de alcance (explícito)

- **Backend propio / Edge Functions**: no existen hoy. Todo lo privilegiado se
  resuelve con funciones `security definer` dentro de Postgres.
- **Notificaciones push**: decisión de 2026-08-19 — el aviso es in-app (feed +
  badge). El push real exige salir de Expo Go a un development build.
- **Backoffice web dedicado**: diferido. Si hace falta ergonomía de admin, se
  evalúa Expo Web (mismo código) antes de comprometer un Next.js.
- **Reset de contraseña self-service**: hoy es manual ("contactá a un admin").
  El *cambio* sabiendo la actual sí existe, en Mis datos (`lib/password.ts`).
- **Modo offline**: no hay persistencia de la caché de TanStack Query.

### 1.4 Audiencia

Desarrolladores que toquen el repo, y quien tenga que auditar el modelo de
permisos. Asume familiaridad con React Native y con RLS de Postgres.

---

## 2. Contexto del sistema

### 2.1 Actores

| Actor | Es | Tiene cuenta |
|---|---|---|
| **Persona de la congregación** | Una fila en `miembros` (el *padrón*) | No necesariamente |
| **`pendiente`** | Cuenta recién registrada, sin resolver | Sí, sin acceso |
| **`miembro`** | Congregante aprobado | Sí |
| **`obrero`** | Líder/discipulador | Sí |
| **`admin`** | Administrador de la app | Sí |

> **Padrón ≠ cuentas.** `miembros` es la lista de personas de la iglesia; muchas
> nunca abren la app (un discípulo menor de edad, alguien mayor sin teléfono).
> `profiles` son las cuentas. El puente entre ambos es `profiles.miembro_id`, que
> es `unique` y **siempre se setea antes de activar una cuenta**.

### 2.2 Diagrama de contexto

```
                    ┌──────────────────────────────┐
                    │   Dispositivo del usuario     │
                    │  ┌────────────────────────┐   │
                    │  │  pdapp (Expo Go 57     │   │
                    │  │  o APK de EAS)         │   │
                    │  │                        │   │
                    │  │  expo-router           │   │
                    │  │  TanStack Query        │   │
                    │  │  supabase-js           │   │
                    │  └───────┬────────────────┘   │
                    │          │  Keychain/Keystore │
                    │          │  (clave AES) +     │
                    │          │  AsyncStorage      │
                    │          │  (sesión cifrada)  │
                    └──────────┼────────────────────┘
                               │ HTTPS + anon key + JWT
                ┌──────────────┼───────────────────────────┐
                │              ▼        Supabase            │
                │   ┌──────────────────────────────────┐    │
                │   │ GoTrue (Auth)  email/password     │    │
                │   │   sobre identificador sintético   │    │
                │   └───────────────┬──────────────────┘    │
                │                   │ JWT (auth.uid())      │
                │   ┌───────────────▼──────────────────┐    │
                │   │ PostgREST  →  Postgres            │    │
                │   │   RLS policies                    │    │
                │   │   funciones security definer      │    │
                │   │   triggers de integridad          │    │
                │   └──────────────────────────────────┘    │
                │   ┌──────────────────────────────────┐    │
                │   │ Storage: `adjuntos` (público)     │    │
                │   │          `materiales` (privado)   │    │
                │   └──────────────────────────────────┘    │
                └───────────────────────────────────────────┘

     Terceros (sin credenciales, solo lectura):
       YouTube RSS  ──►  feed de predicaciones (lib/youtube.ts)
       EAS Update   ──►  entrega de bundles JS OTA
```

### 2.3 Restricciones del entorno

- **Expo Go 57 es el piso**: el usuario corre la app en Expo Go 57, que no ejecuta
  apps de otro SDK. **No se sube el SDK sin confirmar** (ver `AGENTS.md`). De ahí
  que no haya módulos nativos propios: `expo-secure-store`, `expo-crypto`,
  `aes-js` y `expo-document-picker` se eligieron por correr en Expo Go.
- **npm falla por intercepción TLS corporativa** (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  Instalar con `npm install --strict-ssl=false` o exportar la CA en
  `NODE_EXTRA_CA_CERTS`.
- **Sin Android SDK local**: no hay builds nativos locales; solo Expo Go y EAS.

---

## 3. Arquitectura

### 3.1 Decisión estructural: dos capas, sin backend

La app móvil habla **directo** con Supabase. No hay servidor intermedio, ni API
propia, ni capa de servicios. Esto tiene una consecuencia que ordena todo el resto
del diseño:

> **La frontera de seguridad es Postgres, no el cliente.** El bundle de la app y
> la `anon key` son públicos por construcción (viajan en el APK). Cualquiera puede
> hablarle a la API REST de Supabase con `curl`. Por lo tanto, **toda** regla de
> acceso tiene que estar expresada como policy de RLS, función `security definer`
> o trigger. Lo que hace el cliente con `isAdmin`/`esObrero` es *mostrar y ocultar
> UI*, y nada más.

**Por qué se eligió así**: el proyecto lo mantiene una persona, para una iglesia,
sin presupuesto de infraestructura. Un backend propio sería una segunda cosa que
desplegar, versionar y asegurar. Postgres ya sabe hacer autorización por fila.

**Lo que cuesta**: la lógica de negocio no trivial vive en PL/pgSQL, que no se
testea con el tooling de JS y se despliega aplicando archivos SQL a mano. Y cuando
la RLS no alcanza para expresar una lectura (por ejemplo "el discípulo ve su
propio grupo", que la RLS de `discipulados` prohíbe), la salida es una función
`security definer` — que **bypassa la RLS** y por lo tanto tiene que validar la
autorización en su primera línea. Ese patrón se repite y está estandarizado (§5.2).

### 3.2 Stack

| Capa | Elección | Versión | Nota |
|---|---|---|---|
| Runtime | Expo SDK | `~57.0.21` | Expo Go 57; nueva arquitectura (ya no es opcional desde SDK 55) |
| | React Native | `0.86.3` | |
| | React | `19.2.3` | `react-dom` pineado a la misma versión (rompe el build de EAS si divergen) |
| Routing | expo-router | `~57.0.20` | File-based; `typedRoutes` activado |
| Estado servidor | TanStack Query | `^5.101.2` | Única fuente de estado remoto |
| Backend | supabase-js | `^2.110.0` | Postgres + Auth + Storage |
| Estilos | NativeWind / Tailwind | `^4.2.6` / `^3.4.17` | Tokens en `tailwind.config.js` y `lib/theme.ts` |
| Tipografía | Source Serif 4 + Source Sans 3 | `@expo-google-fonts` | Serif titulares, sans cuerpo |
| Iconos | `@expo/vector-icons` (Ionicons) | `^15.0.2` | |
| Cripto de sesión | `expo-secure-store`, `expo-crypto`, `aes-js` | | Ver §5.7 |
| Fechas | *(propio)* `lib/date.ts` | | Sin dependencia; locale es-AR |

**Sin estado global de cliente**: no hay Redux/Zustand/Jotai. Lo remoto es
TanStack Query; lo de sesión es un único `AuthProvider` con Context; lo de
formulario es `useState` local. Es una decisión deliberada de tamaño.

### 3.3 Estructura del repositorio

```
app/                          Rutas (expo-router, file-based)
  _layout.tsx                 Providers + AuthGate (máquina de estados de sesión)
  (auth)/login.tsx            Login/registro por identificador sintético
  (tabs)/                     Inicio · Calendario · Mi grupo · Actividades · Perfil
  pendiente.tsx               Pantalla de espera del rol `pendiente`
  aprobaciones.tsx            Resolución de identidad de cuentas pendientes
  mis-datos.tsx               Autogestión de la ficha propia
  directorio.tsx              Directorio de la congregación
  contenido.tsx               Predicaciones (feed de YouTube)
  ofrendas.tsx                Desglose de ofrendas
  discipulado/[id].tsx        Resumen del grupo que se lidera
  discipulado/discipulos.tsx  Roster: asistencia por discípulo y alta
  discipulado/historial.tsx   Historial de reuniones por mes
  mi-grupo/[id].tsx           Lectura del grupo del que se participa
  reunion/nueva.tsx           Alta/edición de reunión (modal)
  reunion/[id].tsx            Detalle de reunión
  miembro/[id].tsx            Ficha de una persona del padrón
  actividad/[id].tsx          Detalle de evento único
  actividad-semanal/[id].tsx  Detalle de actividad recurrente
  admin/                      ABM completo (guard de cliente + RLS)
components/
  ui.tsx                      Primitivos del design system
  AppBar.tsx                  Header con selector de feed
  MiGrupo · Directorio · Cumples · EventosSemana · ActividadesHoy · Predicaciones
  RichTextEditor / RichTextView
lib/
  supabase.ts                 Cliente + LargeSecureStore
  auth.tsx                    AuthProvider / useAuth
  authIdentity.ts             Identificador → email sintético
  types.ts                    Tipos del dominio (espejo del esquema)
  theme.ts                    Tokens del design system
  date.ts                     Fecha/hora/moneda, locale es-AR
  richText.ts                 Parser de marcas tipo markdown
  youtube.ts                  Feed RSS del canal
  saludos.ts                  Saludo del día
  storage.ts                  Adjuntos: elegir, subir, abrir con validación
  query-logger.ts             Instrumentación de queries (solo __DEV__)
  queries/<entidad>.ts        Un archivo de hooks por entidad
supabase/migrations/          0001–0029 · DDL + RLS + RPC + Storage
docs/                         Documentos de referencia y de decisión
```

### 3.4 Principio de organización de la capa de datos

Un archivo por entidad en `lib/queries/`, con una forma fija:

```ts
export const <entidad>Keys = { … };          // claves de caché, en un solo lugar
export function use<Entidad>()  { … }        // detalle
export function use<Entidad>s() { … }        // lista
export function useUpsert<Entidad>() { … }   // mutación + invalidateQueries explícito
```

La referencia canónica es `lib/queries/discipulados.ts`, que además muestra el
patrón de **baja lógica** (`activo` + `refetchType: "all"` para refrescar también
los tabs que están en segundo plano).

---

## 4. Modelo de datos

### 4.1 Enums

| Enum | Valores | Usado en |
|---|---|---|
| `sexo` | `M`, `F` | `miembros` |
| `sexo_discipulado` | `M`, `F`, `mixto` | `discipulados` |
| `modalidad` | `presencial`, `virtual`, `ambos` | grupos, reuniones, asistencias, actividades |
| `rol_app` | `admin`, `obrero`, `miembro`, `pendiente` | `profiles` |
| `tipo_evento` | `general`, `discipulado`, `otro` | `eventos` |

> `rol_app` nació como `('admin','discipulador')`. `0012` renombró
> `discipulador → obrero` y agregó `pendiente` y `miembro`. El rename hace que los
> perfiles existentes migren solos (es el mismo valor del enum). **Gotcha de
> Postgres**: un valor de enum recién agregado no puede usarse en la misma
> transacción; por eso `0012` solo toca el enum y `0013` lo consume.

### 4.2 Entidades y relaciones

```
  auth.users ──1:1──► profiles ──0..1:1──► miembros ◄── el padrón
                        │  (miembro_id, UNIQUE)          (todas las personas)
                        │                                      │
         discipulador_id│ (UNIQUE → 1 líder = 1 grupo)         │
                        ▼                                      │
                  discipulados ──1:N──► participaciones ───────┤
                        │                (roster, activo)      │
                        └──1:N──► reuniones ──1:N──► asistencias
                                                               │
     profiles ──N:M──► ministerio_lideres ──► ministerios      │
                                                 │             │
                       ministerio_miembros ◄─────┤─────────────┤
                                                 │             │
                    reuniones_ministerio ◄───────┘             │
                              └──1:N──► asistencias_ministerio ┘

                            anuncios ──0..1──► ministerios
                                       (null = toda la iglesia)

  eventos       ── evento ÚNICO, con fecha_inicio/fecha_fin
  actividades   ── actividad RECURRENTE semanal, dias_semana[] + horario fijo
  directorio    ── VISTA sobre miembros: subset seguro, solo adultos activos
```

### 4.3 Las cuatro "cosas" del dominio

Están **deliberadamente separadas**. No hay una tabla polimórfica.

| | `discipulados` | `ministerios` | `actividades` | `eventos` |
|---|---|---|---|---|
| **Qué es** | Grupo con roster y líder | Área/departamento | Ítem de agenda semanal | Evento único |
| **Cuándo** | Un día fijo + horario | Sin horario propio | Uno o más días + horario | Fecha concreta |
| **Líder** | **1:1** (constraint) | **Varios, equivalentes** | — | — |
| **Roster** | `participaciones` | `ministerio_miembros` | — | — |
| **Asistencia** | `reuniones` + `asistencias` | `reuniones_ministerio` + `asistencias_ministerio` | No | No |
| **Ofrenda** | Sí | Sí (**libro separado**) | No | No |
| **Escribe** | Admin (alta), obrero (su grupo) | Admin (alta), líderes (lo operativo) | Solo admin | Solo admin |
| **Ejemplo** | "Jóvenes 18-25, martes 20h" | "Alabanza", "Acción social" | "Oración, martes 20h" | "Adoración especial, vie 25/7" |

**Por qué un ministerio no es un `discipulado` con un `tipo`**: en `discipulados`,
`dia_semana`, `hora_inicio` y `sexo` son `not null`, y el líder es 1:1 por
constraint. Acción social no tiene día fijo y un ministerio no es "de varones".
Aflojar esas columnas rompe a todos los consumidores que hacen
`DIAS_SEMANA[d.dia_semana]` sin preguntar, y metería ministerios dentro de
`mi_grupo()` sin quererlo. Además el vocabulario no sobrevive: "discipulador",
"discípulos", "Mi grupo".

**Por qué la contabilidad va separada**: decisión de producto (2026-08-19). Las
ofrendas de ministerio no comparten tabla con las de discipulado — son dos libros
distintos y no se mezclan por accidente. El costo es que el RPC transaccional se
duplica; las dos funciones quedan marcadas como espejo en su cabecera y **una
corrección en una va sí o sí en la otra**.

Razonamiento completo y preguntas abiertas en
[`ACTIVIDADES-Y-EVENTOS.md`](./ACTIVIDADES-Y-EVENTOS.md) y
[`MINISTERIOS.md`](./MINISTERIOS.md).

### 4.4 Tablas clave

#### `miembros` — el padrón

Todas las personas de la iglesia, tengan cuenta o no. Es la tabla con **el PII más
sensible**: `email`, `telefono`, `notas` (notas pastorales privadas).

Columnas de control agregadas después del esquema base:

- `mostrar_contacto boolean` (`0020`) — **consentimiento**. La persona decide si su
  teléfono se publica en el `directorio`. No afecta lo que ve su discipulador ni el
  admin: ese es el contacto pastoral, no la publicación. Default `true` para
  preservar lo que la congregación ya veía antes de la migración.
- `activo boolean` (`0022`) — **baja lógica del padrón**. En `false` la persona sale
  del directorio y de los cumpleaños, pero conserva ficha e historial. Solo un
  admin puede cambiarlo, garantizado por el trigger `trg_solo_admin_da_de_baja`
  (que además fuerza `activo = true` en cualquier INSERT que no venga de un admin).

#### `profiles` — las cuentas

`id` = `auth.users.id`. Se crea sola por el trigger `handle_new_user` en cada
signup, con `rol` en el default `pendiente` y `username` copiado desde
`raw_user_meta_data` (lo normaliza el cliente, ver §5.6).

`miembro_id` es la **llave de identidad**: apunta a la ficha del padrón de esa
persona. Es `unique` (`0018`) — una ficha no puede enlazarse a dos cuentas.

`anuncios_leidos_hasta timestamptz` (`0026`) es una **marca de agua de lectura**:
lo creado después está sin leer. Da el badge de no leídos sin una tabla de
lecturas; la escribe el propio cliente.

#### `discipulados` — grupos

`discipulador_id` es `unique` (`0005`): **un discipulador lidera a lo sumo un
grupo**. La `unique` de Postgres permite múltiples `NULL`, así que los grupos sin
líder no chocan entre sí — y por eso la baja lógica (`0006`) libera el líder
poniendo `discipulador_id = null` junto con `activo = false`.

#### `reuniones` / `asistencias`

`unique (discipulado_id, fecha)`: **una reunión por grupo por día**. Es lo que hace
que el alta pueda ser un upsert idempotente y lo que obliga a traducir el
`unique_violation` cuando alguien edita la fecha hacia una ya ocupada (`0023`).

`registrado_por` guarda **quién la cargó, no quién la corrigió**: la edición no lo
pisa. Es dato de auditoría, nunca condición de permiso.

**No existe borrado de reuniones para nadie, ni para el admin.**

#### `ministerios` + `ministerio_lideres` + `ministerio_miembros`

- `ministerio_lideres` es **tabla y no columna** porque un ministerio tiene varios
  líderes y **todos son equivalentes**: no hay "líder principal", así que tampoco
  hay columna que los ordene. Apunta a `profiles` y no a `miembros` porque lo que
  autoriza es la cuenta, no la ficha.
- `ministerio_miembros` es el espejo de `participaciones`: va contra el **padrón**,
  porque hay gente que participa del ministerio y no tiene login.
- `unique index ministerios_nombre_unico on (lower(nombre))` — un solo "Jóvenes",
  incluyendo los inactivos: si el ministerio volvió, se reactiva, no se crea al lado.

#### `anuncios`

`ministerio_id` es el **alcance**: `null` = toda la congregación (solo admin
publica); con uuid = solo participantes y líderes de ese ministerio. `autor_id`
tiene `default auth.uid()` y un trigger (`anuncios_conserva_autor`) que lo restaura
en cada UPDATE — el autor original no se pisa cuando otro líder edita.

#### `eventos` / `actividades`

Ambas admiten un adjunto (`adjunto_url` + `adjunto_tipo ∈ {imagen, pdf}`) en el
bucket público `adjuntos`, y una `descripcion` con **marcas tipo markdown** (§6.5).
`actividades.dias_semana` es un `smallint[]` con dos checks: no vacío y contenido
en `0..6`.

### 4.5 Vistas

#### `directorio` — el subset seguro del padrón

```sql
create view public.directorio with (security_invoker = false) as
  select id, nombre, apellido, sexo, fecha_nacimiento,
         case when mostrar_contacto then telefono end as telefono
  from public.miembros
  where public.es_miembro_activo()
    and activo
    and fecha_nacimiento is not null
    and fecha_nacimiento <= (current_date - interval '18 years')::date;
```

Cuatro decisiones concentradas en un `WHERE`:

1. `security_invoker = false` — la vista corre como su dueño y **bypassa la RLS de
   `miembros`**, exponiendo únicamente las columnas listadas. `email` y `notas` no
   pueden salir por acá ni por error.
2. `es_miembro_activo()` — un `pendiente` recibe **0 filas**. El gate de rol está
   dentro de la vista, no en la UI.
3. **Solo adultos** (`0017`) — excluye menores de 18 y a quien no tenga
   `fecha_nacimiento` cargada (sin fecha no hay edad; ante la duda, no se publica).
   Los menores siguen visibles para su discipulador y el admin por la RLS de
   `miembros`.
4. **Teléfono con consentimiento** (`0020`) — la fila aparece igual, pero `telefono`
   llega `null` si la persona no lo habilitó.

#### `ministerios_lideres`

Mismo patrón (`security_invoker = false`, gateada por `es_miembro_activo()`):
resuelve el nombre del líder, que de otro modo sería ilegible — `prof_select`
(`0002`) no deja leer el perfil ajeno.

### 4.6 Invariantes del modelo

| Invariante | Garantizado por |
|---|---|
| Un discipulador lidera a lo sumo un grupo | `discipulados_discipulador_unico` (`0005`) |
| Una ficha del padrón se enlaza a lo sumo a una cuenta | `profiles_miembro_id_unique` (`0018`) |
| Una reunión por grupo y fecha | `unique (discipulado_id, fecha)` (`0001`) |
| Una reunión por ministerio y fecha | `unique (ministerio_id, fecha)` (`0025`) |
| Una asistencia por reunión y persona | `unique (reunion_id, miembro_id)` (`0001`, `0025`) |
| Una participación por grupo y persona | `unique (discipulado_id, miembro_id)` (`0001`) |
| Un solo ministerio con el mismo nombre | `unique index on lower(nombre)` (`0024`) |
| Una actividad tiene al menos un día, en `0..6` | checks `dias_semana_*` (`0015`) |
| Nadie sube su propio rol | trigger `no_autoescalar_rol` (`0010`/`0013`) |
| Solo un admin da de baja a alguien del padrón | trigger `solo_admin_da_de_baja` (`0022`) |
| Solo un admin da de baja un ministerio | trigger `solo_admin_baja_ministerio` (`0024`) |
| El autor de un anuncio no se pisa al editarlo | trigger `anuncios_conserva_autor` (`0026`) |
| Toda cuenta activa tiene ficha del padrón enlazada | RPC `resolver_identidad_pendiente` (`0018`): setea `miembro_id` **antes** de activar |

### 4.7 Bajas lógicas — nunca se borra historia

| Entidad | Columna | Efecto |
|---|---|---|
| `discipulados` | `activo` + `motivo_baja` + `fecha_baja` | Sale de listas; libera al líder; reactivable |
| `participaciones` | `activo` | La persona sale del roster; su historial de asistencias queda |
| `ministerios` | `activo` + `motivo_baja` + `fecha_baja` | Sale del hub y del ABM activo; reactivable |
| `ministerio_miembros` | `activo` | Sale del roster; se sigue devolviendo para poder ponerle nombre a quien figura en una reunión vieja |
| `actividades` | `activa` | Sale del feed y del calendario |
| `miembros` | `activo` (`0022`) | Sale del directorio y cumpleaños; ficha e historial intactos |
| `reuniones` / `reuniones_ministerio` | — | **No se borran.** Se corrigen |

---

## 5. Modelo de seguridad y autorización

> La matriz autoritativa y campo por campo está en
> [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md) (y la de ministerios en
> [`MINISTERIOS.md`](./MINISTERIOS.md)). Acá va el **diseño**: qué mecanismos
> existen, cuándo se usa cada uno y por qué.

### 5.1 Los cinco principios

1. **La autorización vive en el backend.** `isAdmin`/`esObrero` del cliente son
   para mostrar/ocultar UI. Nunca son una frontera.
2. **Gestión = asignación, no rol.** Ser `obrero` no da acceso global: da acceso a
   *tus* grupos (`discipulados.discipulador_id = auth.uid()`) y *tu* gente. En
   ministerios es todavía más claro: **un líder de ministerio no necesita ser
   `obrero`** — puede ser `miembro` y liderar. Lo que habilita es estar en
   `ministerio_lideres`.
3. **PII en capas.** Directorio (nombre + cumple + teléfono con consentimiento)
   para todo miembro activo; email y notas solo para el obrero de esa persona y el
   admin.
4. **Cuenta nueva = inofensiva.** `pendiente` no ve nada. Por eso el registro
   abierto deja de ser un agujero explotable.
5. **Nadie escala su propio rol.** Trigger en `profiles`; solo el admin asigna
   `obrero`/`admin`, y el obrero solo puede activar pendientes ajenos.

### 5.2 Tres mecanismos, tres usos

| Mecanismo | Cuándo | Ejemplo |
|---|---|---|
| **RLS policy** | El acceso se puede expresar como predicado por fila | `disc_select`: `es_admin() or discipulador_id = auth.uid()` |
| **Función `security definer`** | La RLS no alcanza: hay que leer algo que el usuario no puede leer, o escribir varias tablas atómicamente | `mi_grupo()`, `registrar_reunion()` |
| **Trigger** | Hay una columna que nadie debe cambiar aunque tenga UPDATE sobre la fila | `no_autoescalar_rol` (columna `rol`) |

La regla de oro del segundo mecanismo: **una función `definer` bypassa la RLS, así
que valida la autorización en su primera línea** (`if not es_obrero() then raise
exception …`) o encierra el `auth.uid()` en el `WHERE` de manera que no pueda
apuntar a otro.

### 5.3 Helpers de autorización

Todos `security definer` + `set search_path = public`, para no quedar sujetos a la
RLS de las tablas que consultan (y evitar recursión de policies).

| Helper | Devuelve | Origen |
|---|---|---|
| `es_admin()` | `rol = 'admin'` | `0002` |
| `es_obrero()` | `rol in ('obrero','admin')` | `0013` |
| `es_miembro_activo()` | `rol in ('miembro','obrero','admin')` | `0013` |
| `es_discipulador_de(grupo)` | Lidera ese grupo | `0002` |
| `es_discipulador_del_miembro(persona)` | Lidera algún grupo donde esa persona participa | `0009` |
| `miembro_tiene_cuenta(persona)` | Esa ficha ya está enlazada a un `profile` | `0021` |
| `es_lider_de_ministerio(ministerio)` | `auth.uid() ∈ ministerio_lideres` | `0024` |
| `participo_del_ministerio(ministerio)` | Está en el roster activo de ese ministerio | `0024` |

> **La diferencia de fondo entre discipulados y ministerios**: en discipulados el
> permiso es una **igualdad** contra un dueño (`discipulador_id = auth.uid()`); en
> ministerios es **pertenencia a un conjunto**. De ahí sale, sin lógica extra, que
> todo lo que puede hacer un líder lo pueden hacer todos, incluida **editar una
> reunión que cargó otro**. Si aparece un `registrado_por = auth.uid()` en una
> condición de permiso de ministerio, está mal.

### 5.4 Catálogo de RPCs

**Discipulados y padrón**

| RPC | Autoriza con | Para qué existe |
|---|---|---|
| `registrar_reunion(…, p_reunion_id)` | `es_admin() or es_discipulador_de(grupo)` | **Alta y edición transaccional** de reunión + asistencias + ofrenda. Con `p_reunion_id`, el grupo se lee **de la reunión guardada**, no del parámetro |
| `agregar_discipulo(…)` | ídem | Crear ficha del padrón **y** sumarla al grupo, en un paso |
| `candidatos_para_discipulado(grupo, texto)` | ídem | Buscar a quién sumar **antes** de crear una ficha nueva, sin abrir la RLS de `miembros`. Devuelve también a quien ya está en el roster, marcado con `ya_participa` (esconderlo hacía que la pantalla contestara "no está en el padrón" y empujara al duplicado). Umbral de similitud, para que "no hay coincidencia" sea un resultado |
| `mis_datos()` | `auth.uid()` en el `WHERE` | Leer la ficha propia sin abrir el SELECT de `miembros`. Nunca devuelve `notas` |
| `guardar_mis_datos(…)` | `es_miembro_activo()` + `auth.uid()` | Editar la ficha propia. **Update-only** desde `0018`: sin ficha enlazada da error, no crea duplicado. Nunca toca `notas` |
| `guardar_notas_miembro(…)` | `es_admin() or es_discipulador_del_miembro()` | La contracara exacta: escribe **solo** `notas` |
| `candidatos_para_perfil(profile)` | `es_obrero()` | Buscar en el padrón quién puede ser esta cuenta. Ranking `pg_trgm` por nombre + match de últimos 8 dígitos del teléfono. Devuelve el teléfono **enmascarado** |
| `resolver_identidad_pendiente(…)` | `es_obrero()` + trigger | Enlazar (o crear) la ficha **y** activar a `miembro`, atómicamente |
| `mi_grupo()` | `es_miembro_activo()` + `auth.uid()` | Los grupos donde uno **participa** (la RLS de `discipulados` solo deja pasar al líder y al admin) |
| `reuniones_de_mi_grupo(grupo)` | Participación activa en ese grupo | Historial visto por un discípulo: **solo** fecha, tema y presentes |
| `miembro_tiene_cuenta(persona)` | — (dato no sensible) | Saber si la ficha ya se autogestiona |

**Ministerios y anuncios** (`0024`–`0026`) — cada uno es el espejo declarado de su
equivalente de discipulados:

| RPC | Espejo de | Nota |
|---|---|---|
| `mis_ministerios()` | `mi_grupo()` | Devuelve `soy_lider`, los nombres de los líderes y el conteo de integrantes (solo si liderás) |
| `reuniones_de_mi_ministerio(id)` | `reuniones_de_mi_grupo()` | Fecha, tema y presentes. **Sin ofrenda ni notas**, cortado en el `returns table` |
| `integrantes_de_mi_ministerio(id)` | el corte de `directorio` | Roster para el líder. **Incluye menores** (los necesita para pasar lista); teléfono según `mostrar_contacto`; sin email ni notas |
| `candidatos_para_ministerio(id, texto)` | `candidatos_para_perfil()` | Buscar a quién sumar sin abrir la RLS de `miembros`. Excluye a los que ya están en el roster |
| `agregar_integrante_ministerio(…)` | `agregar_discipulo()` | Crear ficha **y** sumarla al roster |
| `registrar_reunion_ministerio(…)` | `registrar_reunion()` | Misma mecánica, mismo cuidado con el `p_reunion_id` |
| `anuncios_visibles(incluir_vencidos)` | — | Resuelve alcance + vencimiento + nombres de ministerio y autor en una consulta |

> **Por qué los de búsqueda y alta son RPC y no un `insert` directo**: desde `0014`
> la RLS de `miembros` no deja leer el padrón salvo a admin o al discipulador de esa
> persona, y `miembros_insert` exige `es_admin() or es_obrero()`. Un líder de
> jóvenes que sea `miembro` no podría ni buscar ni crear. Y `directorio` **no sirve**
> como reemplazo: desde `0017` excluye a los menores de 18 — justo la población de
> adolescentes y jóvenes.

> **Dónde está el corte de PII en `reuniones_de_mi_grupo`**: en el `returns table`.
> `ofrenda_total`, `notas` y `material_url` no están declarados en el tipo de
> retorno, así que no hay forma de que salgan. El corte es del backend, no de la UI.

### 5.5 Triggers

| Trigger | Tabla | Qué impide |
|---|---|---|
| `on_auth_user_created` → `handle_new_user` | `auth.users` | — (crea el `profile` con rol `pendiente`) |
| `trg_no_autoescalar_rol` → `no_autoescalar_rol` | `profiles` | Cambiar `rol` salvo: `auth.uid() is null` (bootstrap/servidor), `es_admin()`, o un obrero activando un `pendiente → miembro` **ajeno** |
| `trg_solo_admin_da_de_baja` → `solo_admin_da_de_baja` | `miembros` | Cambiar `activo` sin ser admin. En INSERT, lo fuerza a `true` |
| `trg_solo_admin_baja_ministerio` | `ministerios` | Que un líder toque `activo`/`motivo_baja`/`fecha_baja` de su ministerio (sí puede editar nombre y descripción) |
| `trg_anuncios_conserva_autor` | `anuncios` | Que un UPDATE cambie `autor_id` |

El guard `auth.uid() is null` en los tres primeros es deliberado: permite el
bootstrap del primer admin desde el SQL Editor. Un anónimo por la API REST nunca
llega ahí — la RLS lo frena antes.

### 5.6 Autenticación sin correo electrónico

La premisa de producto es que **muchos miembros no tienen email**. La app usa el
proveedor email/password de Supabase con un **identificador sintético**:

```
"11 5555 4444"     → normalizeIdentifier → "1155554444"  → 1155554444@u.appchurch.app
"María Núñez"      → normalizeIdentifier → "marianunez"  → marianunez@u.appchurch.app
```

`lib/authIdentity.ts`:
- Si parece teléfono (solo dígitos/separadores y ≥6 dígitos) → deja solo dígitos.
- Si no → minúsculas, **descomposición Unicode NFD para quitar diacríticos**
  (`María` y `Maria` normalizan igual — sin esto, quien tipeó con tilde un día y sin
  ella al siguiente quedaba con dos identificadores y no podía volver a entrar), y
  conserva `[a-z0-9._-]`.

**Restricciones que esto impone y que no se pueden cambiar en silencio**:

1. **La confirmación de email tiene que estar APAGADA** en el dashboard de Supabase
   (Auth → Email → Confirm email = off). No es un descuido: es lo que hace viable el
   diseño. Si se prende, nadie puede entrar.
2. **El dominio sintético tiene que tener un TLD real.** GoTrue rechaza `.local`,
   `.test`, `.example`, `.invalid` e `.internal` con `email_address_invalid` en la
   validación de formato, antes de intentar enviar nada. De ahí `u.appchurch.app`.
3. **No hay reset por email** (no hay email). Hoy es "contactá a un admin".

**Fortaleza de contraseña** (hallazgo #8 Parte A): el signup valida ≥8 caracteres y
que no sea puramente numérica, en el cliente, antes de llamar a `signUp`.

**Riesgo asumido**: colisión usuario↔teléfono si alguien elige un handle idéntico a
un número. La app traduce el error de Supabase a un mensaje que propone otro dato.

### 5.7 Almacenamiento de la sesión — `LargeSecureStore`

`SecureStore` (Keychain/Keystore) no admite valores de más de ~2048 bytes, y una
sesión de Supabase (access token + refresh token de larga vida + user) los supera.
El adaptador de `lib/supabase.ts` implementa el patrón oficial:

```
  escritura:  clave AES-256 aleatoria (expo-crypto)
              → cifra el blob de sesión (aes-js, modo CTR)
              → clave  ⟶ SecureStore  (respaldado por hardware)
              → cifrado ⟶ AsyncStorage
  lectura:    sin clave en el keystore ⇒ se trata como sesión ausente (re-login)
```

Un atacante con acceso al storage plano (root, backup, malware) obtiene solo texto
cifrado. La aleatoriedad sale de `expo-crypto` y no de
`react-native-get-random-values` para no agregar un módulo nativo fuera de Expo Go.

**No cambiar esto por un adaptador plano de AsyncStorage** — es la remediación del
hallazgo de seguridad #4.

### 5.8 Storage

| Bucket | Público | Lee | Escribe | Uso actual |
|---|---|---|---|---|
| `adjuntos` | **Sí, por diseño** | Cualquiera con la URL | Solo admin | Flyers de eventos y actividades |
| `materiales` | No | Autenticado | Dueño de la carpeta `<uid>/…` o admin | **Ninguno** (scaffolding de Fase 2) |

`adjuntos` es público porque son flyers pensados para difusión. Para que la URL no
sea enumerable, el nombre del objeto es un `Crypto.randomUUID()` (128 bits) y la
extensión se sanitiza (viene del nombre elegido por el usuario).

**Todo lo que se abre con `Linking` pasa por `abrirAdjunto()`**, que valida
`^https://` antes de abrir. Es defensa en profundidad: aunque hoy solo un admin
escriba `adjunto_url`, no se confía en el valor guardado — así no se disparan
`javascript:`, `file://` ni `intent://`.

### 5.9 Historial de revisiones de seguridad

Tres revisiones documentadas, con 11 hallazgos numerados:

| # | Sev. | Hallazgo | Estado |
|---|---|---|---|
| 1 | CRÍTICA | Registro abierto + SELECT de `miembros` expone el padrón | Parte B **resuelta** (`0014` + vista `directorio`); Parte A **diferida por producto** |
| 2 | CRÍTICA | `miembros_write` dejaba a cualquiera editar/borrar | **Resuelto** (`0009`) |
| 3 | ALTA | Auto-escalada a admin vía `prof_update_self` | **Resuelto** (`0010`, ampliado en `0013`) |
| 4 | ALTA | Sesión en AsyncStorage plano | **Resuelto** (`LargeSecureStore`) |
| 5 | ALTA | Adjuntos con URL adivinable | **Resuelto** (UUID v4) |
| 6 | MEDIA | `Linking.openURL` sin validar esquema | **Resuelto** (`abrirAdjunto`) |
| 7 | MEDIA | `materiales` sin scoping ni DELETE | **Resuelto** (`0011`) |
| 8 | MEDIA | Sin reset ni política de contraseña | Parte A **resuelta**; B y C **abiertas** |
| 9 | BAJA | Anon key en `eas.json` | **Aceptado** (la seguridad recae en RLS) |
| 10 | BAJA | Sin certificate pinning | **Abierto** |
| 11 | ALTA | `profiles.miembro_id` era auto-editable → IDOR de PII | **Resuelto** (`0029`) |

> **Hallazgo #11 — resuelto en `0029`.** `0016`/`0018` convirtieron
> `profiles.miembro_id` en una **clave de autorización** (`mis_datos`,
> `guardar_mis_datos`, `mi_grupo`, `participo_del_ministerio`… resuelven "cuál es
> mi ficha" por ese link), pero `prof_update_self` (`0002`) nunca acotó **qué
> columnas** se podían editar del propio perfil: un miembro podía apuntar su
> `miembro_id` a la ficha de otra persona y leer/escribir su PII. `0029` revoca el
> UPDATE de tabla sobre `profiles` y otorga solo las dos columnas que el cliente
> escribe (`rol`, cuidada por el trigger anti-escalada, y `anuncios_leidos_hasta`,
> de `0026`); borra `prof_obrero_activar`, así que activar un pendiente es solo por
> `resolver_identidad_pendiente`; y exige `es_miembro_activo()` en `mis_datos()`.
> Toda columna nueva de `profiles` que el cliente tenga que escribir necesita su
> propio `grant update (...)`. Detalle en
> [`SECURITY-REVISION-RED.md`](./SECURITY-REVISION-RED.md).

---

## 6. Diseño del cliente móvil

### 6.1 Mapa de rutas y guards

expo-router resuelve por archivos. La jerarquía de layouts es la que hace de guard:

```
app/_layout.tsx          GestureHandler → SafeArea → QueryClient → AuthProvider
  └─ AuthGate            ← decide qué stack se ve
      ├─ (auth)/         sin sesión
      ├─ pendiente       con sesión + rol 'pendiente'
      ├─ (tabs)/         con sesión aprobada  (5 tabs)
      ├─ admin/          _layout.tsx → <Redirect> si !isAdmin
      └─ resto de pantallas de detalle (stack)
```

**`AuthGate` es una máquina de estados chica y explícita** (`app/_layout.tsx`):

| Estado | Se muestra |
|---|---|
| `loading` | `Loader` (logo + spinner) |
| sesión + `profileError` | `ProfileErrorScreen` con *Reintentar* / *Cerrar sesión* |
| sesión sin perfil cargado | `Loader` (evita mostrar la pantalla equivocada un instante) |
| sin sesión | redirige a `/(auth)/login` |
| `rol === 'pendiente'` | redirige a `/pendiente` |
| resto | `/(tabs)` |

La pantalla de error existe por una razón concreta: antes, si la carga del perfil
fallaba por red, `profile` quedaba en `null` para siempre y el spinner giraba sin
fin. Ahora el perfil vive en React Query con `retry: 3` y un estado de error
distinguible de "todavía cargando".

**El guard de `admin/` es solo de UI.** Lo real lo aplica la RLS: un no-admin que
llegue a esas pantallas por deep link recibe listas vacías y errores en las
escrituras.

> **Para ministerios, `lib/auth.tsx` no alcanza para gatear la UI**: `esObrero`
> deja afuera justo a quien tiene que gestionar, porque un líder de ministerio
> puede ser `miembro`. El gate va contra el resultado de `mis_ministerios()`
> (`soy_lider`), vía `useMisMinisterios()` / `useSoyLiderDe(id)`. Ninguna pantalla
> de ministerios pregunta por el rol.

### 6.2 Sesión y el arranque en frío (BUG-01)

`AuthProvider` (`lib/auth.tsx`) hace algo que no es obvio y conviene no deshacer:

```ts
const syncSession = (s, label) => {
  const prev = lastUserId;
  lastUserId = s?.user?.id ?? null;
  setSession(s);
  if (lastUserId && lastUserId !== prev) qc.invalidateQueries();  // ← esto
};
```

**Por qué**: en arranque en frío con el access token vencido, `getSession()`
devuelve `null` (~800 ms) mientras refresca por detrás. `loading` pasa a `false`,
se montan los tabs, y las queries salen **sin token** → la RLS devuelve `[]` → con
`staleTime: 30_000` ese vacío queda cacheado. El token bueno llega después por
`onAuthStateChange: SIGNED_IN`, pero nadie re-invalidaba. Resultado: la app parecía
vacía hasta que uno navegaba entre tabs.

El fix invalida **todas** las queries cuando el token pasa de ausente a presente.
La query del perfil está keyed por `session.user.id` para entrar en la misma
invalidación. Detalle completo en [`BUGS.md`](./BUGS.md) BUG-01.

### 6.3 Capa de estado

`QueryClient` global con `retry: 1` y `staleTime: 30_000`. Cada entidad expone sus
hooks y su objeto de claves; las mutaciones invalidan explícitamente.

Dos matices que se repiten y valen como convención:

- **`refetchType: "all"`** cuando el cambio afecta pantallas que están en segundo
  plano (dar de baja un grupo, editar una reunión que mueve fecha y ofrenda). Sin
  esto, al volver al tab los datos están viejos.
- **`enabled`** para no disparar consultas que la RLS va a vaciar. Ejemplo:
  `useDiscipulados({ enabled: esObrero })` — para un `miembro` la RLS siempre
  devuelve `[]`, y su grupo llega por el RPC `mi_grupo`.

**Excepción a la regla "todo es Supabase"**: `lib/queries/contenido.ts` pega contra
el RSS de YouTube. Usa `staleTime` de 30 min y `gcTime` de 24 h — una iglesia sube
contenido cada varios días, no cada minuto, y es un fetch a un tercero. El filtro de
shorts va en `select` y no en el `queryFn`, para que la caché guarde el feed tal como
llegó.

### 6.4 Design system — "Sacred Assembly"

Crema de fondo, navy profundo como primario, dorado como acento. Serif (Source
Serif 4) para titulares, sans (Source Sans 3) para cuerpo. Los tokens viven en dos
lugares que hay que mantener en sincronía: `lib/theme.ts` (para props de estilo de
RN) y `tailwind.config.js` (para clases de NativeWind).

`components/ui.tsx` expone los primitivos: `Display` / `Headline` / `Title` /
`Body` / `Muted` / `Label` para tipografía; `Screen`, `KeyboardScrollView`, `Card`,
`Chip`, `Button`, `Field`, `SwitchField`, `Avatar`, y una familia de `Skeleton`
para estados de carga. **Preferir estos por sobre `Text`/`View` + clases sueltas**
cuando exista uno que encaje.

`KeyboardScrollView` envuelve un `KeyboardAvoidingView` con `behavior="padding"` en
Android — `automaticallyAdjustKeyboardInsets` solo funciona en iOS, y con
`edgeToEdgeEnabled` el teclado tapaba los inputs (BUG-02).

### 6.5 Descripciones con formato

`eventos.descripcion`, `actividades.descripcion`, `ministerios.descripcion`,
`anuncios.cuerpo` y `miembros.notas` admiten marcas tipo markdown. **Se guarda
texto plano con marcas, en la misma columna `text`**: no hubo migración, no cambió
ninguna policy y las descripciones viejas siguen siendo válidas (son markdown sin
marcas).

`miembros.notas` es la única de esas columnas que **no** es contenido publicado:
son las notas del seguimiento pastoral, y quien las lee es el mismo que las
escribe (su discipulador, o el admin). El formato es el mismo; la audiencia, no
— ver §7.3.

```
# Título      ## Subtítulo    ### Sub-subtítulo
- viñeta      1. numerada     > cita
**negrita**   _cursiva_       __subrayado__
~~tachado~~   `código`        [texto](https://…)
```

- **Escritura** — `RichTextEditor.tsx`: un `TextInput` con una barra que inserta
  marcas sobre lo seleccionado, más "Vista previa" con el mismo renderer de la app.
- **Lectura** — `RichTextView.tsx`: parsea a bloques y dibuja con `<Text>`/`<View>`.
  Los enlaces salen por `abrirAdjunto()` (solo `https://`).
- **Regla que se rompe fácil**: todo lo que muestre una descripción recortada
  (`numberOfLines`) o la busque **tiene que pasar por `aTextoPlano()`**. Sin eso se
  ven los asteriscos y los `#` crudos.

Sin dependencias nuevas y sin WebView. Se evaluó tiptap en WebView
(`@10play/tentap-editor`) y se descartó: dos módulos nativos, obligaba a guardar
HTML y a mantener un parser de HTML igual, y arrastra `react-dom` al árbol —
conflicto conocido con el React 19 del proyecto.

### 6.6 Integración con YouTube

`lib/youtube.ts` lee el **RSS público** del canal
(`youtube.com/feeds/videos.xml?channel_id=…`), no la Data API.

**Por qué**: la Data API exige una key, y en una app móvil esa key viajaría en el
bundle (`EXPO_PUBLIC_*`) al alcance de cualquiera — con una cuota de 10k/día
quemable por un tercero. El RSS no pide credenciales ni tiene cuota.

**Lo que cuesta**: solo los últimos 15 videos, sin duración y sin distinguir
shorts. Los shorts se filtran por el `<link>` (apuntan a `/shorts/` en vez de
`/watch`) porque son recortes del mismo sermón y duplicaban la lista. Si algún día
hace falta el historial completo, el camino es proxiar la Data API detrás de una
Edge Function, no meter la key acá.

**Lo que también cuesta: el feed se cae.** Durante 2026 `feeds/videos.xml` viene
devolviendo 404 de a ratos — no es este canal ni esta app: el mismo 404 lo da el
canal oficial de YouTube y lo firma `Server: YouTube RSS Feeds server`. Vuelve
solo al rato. Por eso `videos_canal` (0030) guarda el **último feed bueno** y
`useVideosCanal` resuelve en este orden:

1. respaldo fresco (< 6 h) → se muestra sin tocar YouTube;
2. respaldo vencido o vacío → se pide el feed y, si llega, se guarda;
3. el feed falló → se muestra el respaldo aunque esté vencido;
4. no hay ni respaldo → error, y la pantalla ofrece ir al canal.

La tabla es un **espejo, no un historial**: cada refresco la reemplaza por las
15 entradas del feed. No guarda la URL del video ni la de la miniatura —las dos
se derivan del id validado, igual que en el parser, porque de ahí salen un
`Linking.openURL` y un `<Image>`—, y solo la escribe la RPC
`guardar_videos_canal` (admin), con el mismo criterio que `anuncios`: lo que ve
toda la congregación lo escribe un admin. El respaldo se refresca, entonces,
cuando un admin abre la app; para predicaciones semanales alcanza.

---

## 7. Flujos principales

### 7.1 Registro → aprobación → miembro

Este es el flujo con más diseño detrás, porque resuelve dos problemas a la vez:
seguridad (una cuenta nueva no debe ver nada) e integridad del padrón (no deben
aparecer fichas duplicadas de la misma persona).

```
 1. Persona     → login.tsx: escribe teléfono/usuario + nombre + contraseña
                  · valida ≥8 chars, no solo dígitos
                  · identifierToEmail() → "1155554444@u.appchurch.app"
 2. GoTrue      → signUp (sin confirmación de email)
                  · si no devuelve sesión, la app hace signInWithPassword
 3. Postgres    → trigger handle_new_user
                  · INSERT profiles (rol = 'pendiente' por default, username)
 4. App         → AuthGate ve rol 'pendiente' → /pendiente. NO VE NADA.
 5. Obrero      → aprobaciones.tsx: lista de pendientes (prof_obrero_ve_pendientes)
 6. Obrero      → abre una cuenta → RPC candidatos_para_perfil(profile)
                  · ranking pg_trgm sobre nombre + match de últimos 8 dígitos
                  · excluye fichas ya enlazadas
                  · teléfono enmascarado: "••••4444"
 7. Obrero      → elige "es esta persona"  ó  "cargar ficha nueva"
 8. Postgres    → RPC resolver_identidad_pendiente (atómico)
                  · valida es_obrero()
                  · valida que la cuenta siga 'pendiente'
                  · valida que la ficha no esté ya enlazada
                  · si no hay ficha: la crea (nombre y sexo obligatorios)
                  · UPDATE profiles SET miembro_id = …, rol = 'miembro'
                    └─ dispara trg_no_autoescalar_rol (2ª barrera)
 9. App         → rol 'miembro': ve red, directorio, cumpleaños y su grupo
```

**La decisión clave**: *activar no es un toggle de rol*. No existe un camino que
haga `update profiles set rol = 'miembro'` sin resolver la identidad. Si existiera,
la persona entraría sin `miembro_id`, y al editar sus datos desde "Mis datos" se
crearía una **segunda ficha** de alguien que ya está en el padrón. Por eso
`guardar_mis_datos` es update-only desde `0018`: sin ficha enlazada, error explícito
en vez de duplicado silencioso.

**Riesgo asumido**: el gate es tan fuerte como el obrero menos cuidadoso. Cualquier
obrero puede activar, y todo miembro ve los teléfonos que se compartieron. Si se
quiere más control, la activación se puede restringir a admin.

### 7.2 Registrar y editar una reunión

```
 reunion/nueva.tsx  → useRegistrarReunion() → RPC registrar_reunion(…)

  ALTA (p_reunion_id = null)                EDICIÓN (p_reunion_id = uuid)
  ────────────────────────────              ─────────────────────────────
  grupo := p_discipulado_id                 grupo := (select discipulado_id
                                                      from reuniones
                                                      where id = p_reunion_id)
  ▼                                         ▼
  autoriza: es_admin() or es_discipulador_de(grupo)
  ▼                                         ▼
  INSERT … ON CONFLICT                      UPDATE reuniones SET …
    (discipulado_id, fecha)                   (registrado_por NO se toca)
    DO UPDATE                               ▼
  ▼                                         DELETE asistencias que no vienen
  UPSERT asistencias del payload              en el payload
                                            ▼
                                            (unique_violation → mensaje legible:
                                             "ese grupo ya tiene una reunión
                                              registrada en esa fecha")
```

Tres decisiones que vale la pena no perder:

1. **En la edición, el grupo sale de la reunión guardada, no del parámetro.** Es lo
   único que la RPC puede creerle a alguien que dice ser dueño de esa reunión. Si
   autorizara contra `p_discipulado_id`, bastaría con mandar el id de un grupo propio
   para editar la reunión de otro.
2. **El payload manda al editar**: las asistencias que no vienen se borran. En el
   alta no, porque el alta es un upsert idempotente.
3. **`registrado_por` no se pisa**: es quien la cargó, no quien la corrigió.

`registrar_reunion_ministerio` (`0025`) es el espejo exacto, con
`es_lider_de_ministerio` en lugar de `es_discipulador_de`.

> **Consecuencia del `unique (ministerio_id, fecha)`**: si dos líderes cargan la
> misma fecha, el segundo no duplica — el upsert corrige la que ya estaba. Es el
> comportamiento deseado, pero la pantalla debería avisar que esa fecha ya tenía algo
> cargado en vez de pisarla en silencio.

### 7.3 Quién edita la ficha de una persona

Este flujo cambió en `0021` y es el que más confunde si uno no vio la decisión.

```
                 ¿La ficha está enlazada a una cuenta?
                    (miembro_tiene_cuenta(id))
                            │
              ┌─────────────┴──────────────┐
             NO                            SÍ
              │                            │
   El discipulador puede           El discipulador YA NO puede
   editar los datos                editar los datos (RLS lo corta)
   (RLS miembros_update)                   │
              │                            │
              └──────────┬─────────────────┘
                         │
        En los dos casos, y solo el discipulador o el admin:
        `notas` (nota pastoral) por RPC guardar_notas_miembro
                         │
        Y en el caso "SÍ", los datos personales los edita
        la propia persona por RPC guardar_mis_datos
```

**Por qué**: antes los dos caminos escribían la misma fila. El discipulador podía
pisar —sin enterarse— lo que la persona acababa de corregir, incluido su
`mostrar_contacto`. Las dos RPC son contracaras exactas: `guardar_mis_datos` edita
todo **menos** `notas`; `guardar_notas_miembro` edita **solo** `notas`.

La **lectura** no cambia: el discipulador sigue viendo la PII completa de su gente.
Y el admin no pierde nada — es el ABM del padrón y quien corrige por quien no puede.

**En la pantalla** (`app/miembro/[id].tsx`): con cuenta enlazada la ficha se dibuja
como una vista resumida de solo lectura (cumpleaños, teléfono, email), sin un solo
input. Las notas están abajo, en su propia tarjeta, con el label **"Notas"** y el
editor de texto enriquecido (§6.5) — **una sola tarjeta para las dos ramas**, la
con cuenta y la sin cuenta, siempre por `guardar_notas_miembro`. El formulario de
datos personales (rama sin cuenta, o admin) ya **no** manda `notas` en el upsert:
dos caminos para la misma columna solo servían para que un "Guardar cambios"
pisara lo que el otro botón acababa de guardar.

Esa nota **no la ve la persona**: `mis_datos()` nunca devuelve `notas` (`0016`) y
`miembros_select` (`0014`) solo deja leer la ficha al admin y al discipulador de
esa persona.

### 7.4 Adjuntar un flyer

```
 elegirAdjunto()   → DocumentPicker (image/* | application/pdf)
                     tipo := mimeType.startsWith("image/") ? "imagen" : "pdf"
 subirAdjunto()    → path := `${Crypto.randomUUID()}.${ext sanitizada}`
                     upload al bucket `adjuntos` (upsert: false)
                     → getPublicUrl()
 guardar           → eventos/actividades.adjunto_url + adjunto_tipo
 abrirAdjunto(url) → valida ^https:// → Linking.openURL
```

---

## 8. Build, entornos y despliegue

### 8.1 Comandos

```bash
npm start          # dev server — escanear el QR con Expo Go 57
npm run android    # emulador/dispositivo
npm run ios        # simulador (solo macOS)
npm run web        # target web
npm run build:apk  # eas build --platform android --profile preview
npx tsc --noEmit   # type-check (no hay script de lint ni de test)
```

### 8.2 Perfiles de EAS

| Perfil | Distribución | Artefacto | Canal |
|---|---|---|---|
| `development` | internal | APK con dev client | `development` |
| `preview` | internal | **APK** | `preview` |
| `production` | store | AAB, `autoIncrement` | `production` |

Los tres inyectan `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`
apuntando al **mismo proyecto de Supabase**. No hay entorno de staging con base
separada: las pruebas van contra los datos reales.

**EAS Update** está configurado (`updates.url` + `runtimeVersion: { policy:
"appVersion" }`). Consecuencia práctica: mientras `version` de `app.json` no cambie,
un update OTA llega a los APK ya instalados; si cambia, hace falta un build nuevo.

**Gotcha conocido del build**: el lock desincroniza `react-dom` respecto de `react`
y rompe el build de EAS. `react-dom` está pineado a `19.1.0`, igual que `react`.

### 8.3 Configuración obligatoria fuera del repo

Estas dos cosas no están versionadas y **el sistema no funciona sin ellas**:

1. **Supabase Auth → Email → "Confirm email" = OFF.** Es lo que permite el login sin
   correo real (§5.6). Los usuarios creados *antes* de apagarlo quedan sin confirmar;
   se arreglan con
   `update auth.users set email_confirmed_at = now() where email_confirmed_at is null;`
2. **Las migraciones aplicadas.** Ver abajo.

### 8.4 Migraciones

`supabase/migrations/0001` … `0029`, **en orden numérico**, por SQL Editor o
`supabase db push`. No hay CI que las aplique ni verificación automática de que la
base esté al día.

**Riesgo operativo real**: la app y la base se despliegan por caminos distintos
(EAS Update / SQL a mano). Un update OTA que llame a una RPC con una firma nueva
llega al dispositivo **antes** de que la migración corra, y la llamada falla. Ya
pasó: `0020` cambió la firma de `guardar_mis_datos` agregando `p_mostrar_contacto`,
y "Mis datos" falló hasta que la migración se aplicó.

> **Regla**: migración primero, update después.

**Bootstrap del primer admin** (el trigger crea a todos como `pendiente`):

```sql
update profiles set rol = 'admin'
where id = (select id from auth.users where email = 'tu-identificador@u.appchurch.app');
```

Funciona desde el SQL Editor porque ahí `auth.uid()` es `null` y el trigger
`no_autoescalar_rol` deja pasar ese caso.

---

## 9. Calidad, observabilidad y limitaciones

### 9.1 Verificación

**No hay tests automatizados ni linter configurado.** No los inventes:
`package.json` no define `lint` ni `test`. Lo que sí hay:

- `tsconfig.json` con `strict: true` → `npx tsc --noEmit` es el único chequeo
  automático disponible.
- Verificación **manual en dispositivo**, que es cómo se validan los flujos.
- El plan de verificación end-to-end del modelo de roles está escrito, incluida la
  prueba por API directa con `curl` + anon key (ver
  [`PLAN-RED-IGLESIA.md`](./PLAN-RED-IGLESIA.md) §Verificación) — que es la forma
  correcta de auditar RLS: sin pasar por la UI.

**Consecuencia de diseño**: como la lógica crítica está en PL/pgSQL y no hay tests,
las migraciones compensan con **comentarios extensos que explican el porqué** — qué
hallazgo cierran, qué rompían antes, qué caso raro cubren. Ese es el mecanismo de
calidad del proyecto; mantenerlo al agregar migraciones.

### 9.2 Observabilidad

Solo en `__DEV__`:

- `lib/query-logger.ts` — `[query] ▶/✔/✖ <key> — <ms>ms — <n> fila(s)` por query.
- `lib/auth.tsx` — tiempos de `getSession`, carga de perfil y eventos de
  `onAuthStateChange`.

En producción no hay telemetría, ni crash reporting, ni logs. Un error que le pasa a
un usuario no deja rastro en ningún lado.

### 9.3 Bugs abiertos

| | Estado |
|---|---|
| **BUG-01** — la info no carga al iniciar sesión | 🟢 fix aplicado (§6.2), **falta verificar en dispositivo** con token vencido |
| **BUG-02** — inputs detrás del teclado | 🟡 aplicado, **falta verificar en Android** con edge-to-edge. Si persiste, la salida robusta es `react-native-keyboard-controller` (exige dev build, no corre en Expo Go) |

### 9.4 Deuda técnica conocida

| | Detalle |
|---|---|
| **Dependencias muertas** | `zod`, `react-hook-form` y `react-native-calendars` están en `package.json` y **no se importan en ningún lado** |
| **Sin telemetría** | §9.2 |
| **Sin entorno de staging** | Los tres perfiles de EAS apuntan a la misma base |
| **Deriva de documentación** | El "Estado de implementación" de [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md) dice que `0020` está pendiente de aplicar, pero el repo ya tiene hasta `0026`. [`WEB-APP-IOS.md`](./WEB-APP-IOS.md) cuenta 3 call-sites de `DateTimePicker`; hoy son **5** (`admin/eventos`, `aprobaciones`, `miembro/[id]`, `mis-datos`, `reunion/nueva`) |
| **Anon key en `eas.json`** | Aceptado (hallazgo #9): es pública por diseño y la seguridad recae en RLS. Pero implica que **rotar la key exige rebuild**, no un OTA |
| **RPC de reunión duplicado** | `registrar_reunion` y `registrar_reunion_ministerio` son espejo por decisión de producto. Sin test que verifique que siguen alineados: la única red es el comentario en la cabecera de cada una |

---

## 10. Estado de implementación y evolución

### 10.1 Qué está vigente

| Área | Estado |
|---|---|
| Discipulados: grupos, roster, reuniones, asistencia, ofrendas | ✅ Completo (`0001`–`0011`, `0023`) |
| Roles expandidos + registro con aprobación | ✅ Completo (`0012`–`0013`) |
| Directorio (solo adultos, teléfono con consentimiento) | ✅ Completo (`0014`, `0017`, `0020`) |
| Autogestión de datos propios | ✅ Completo (`0016`, `0018`, `0021`) |
| Resolución de identidad al activar | ✅ Completo (`0018`) |
| Lectura del grupo propio para el discípulo | ✅ Completo (`0019`) |
| Baja lógica del padrón | ✅ Completo (`0022`) |
| Eventos y actividades recurrentes | ✅ Completo (`0007`, `0015`) |
| Contenido (predicaciones por RSS), rich text, saludos | 🟡 **En el working tree, sin commitear** |
| **Ministerios y anuncios** | ✅ Fases A-C completas (`0024`-`0026` + cliente). **Migraciones sin aplicar** (ver abajo) |

### 10.2 Ministerios y anuncios

El diseño completo está en [`MINISTERIOS.md`](./MINISTERIOS.md), que además anota
las desviaciones entre el diseño original y lo construido. Estado:

| Pieza | Estado |
|---|---|
| `0024_ministerios.sql` — tablas, RLS, helpers, vista `ministerios_lideres`, `mis_ministerios`, roster, candidatos | ✅ Escrita |
| `0025_reuniones_ministerio.sql` — reuniones, asistencias, RPC transaccional | ✅ Escrita |
| `0026_anuncios.sql` — anuncios con alcance + marca de agua de lectura + `anuncios_visibles` | ✅ Escrita |
| Tipos en `lib/types.ts` (`Ministerio`, `MiMinisterio`, `Anuncio`, …) | ✅ |
| `lib/queries/ministerios.ts` / `anuncios.ts` | ✅ |
| `app/ministerio/[id]`, `/editar`, `/integrantes`, `app/admin/ministerios`, `app/anuncios` | ✅ |
| `origen` (`discipulado` \| `ministerio`) en `reunion/nueva`, `reunion/[id]` y `ofrendas` | ✅ |
| Hub "Mi grupo" → "Mi discipulado" + "Donde participo" + "Mis ministerios" | ✅ |
| Sección de anuncios en el feed + badge de no leídos en el `AppBar` | ✅ |
| Push con la app cerrada (Fase D) | ❌ Fuera de alcance: exige salir de Expo Go |

> ⚠ **`0024`–`0026` todavía no se aplicaron a la base.** El cliente ya las
> consume, así que hasta que corran, el hub de "Mi grupo", la campana de anuncios
> y el feed fallan con *function does not exist*. Verificar el estado real del
> proyecto de Supabase (§8.4) y correrlas en orden. Regla de siempre: **migración
> primero, app después**.

**Lo que queda por decidir** (diferidos de `MINISTERIOS.md`): si un ministerio
aparece en el calendario (cruza con el diferido #5 de actividades), si el
participante ve el roster, autoinscripción, ofrenda con destino, motivo de baja de
un integrante, y si un líder puede sumar colíderes.

### 10.3 Otros frentes

| Frente | Estado | Referencia |
|---|---|---|
| **Web app / PWA para iOS** | Plan completo escrito. Bloqueante único: wrapper `DatePicker` web (`<input type="date">`) — hoy 5 call-sites | [`WEB-APP-IOS.md`](./WEB-APP-IOS.md) |
| **Reset de contraseña** | Requiere Edge Function con `service_role` (no hay email) | [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md) #8C |
| **Config de Auth en el dashboard** | Mínimo de longitud + HaveIBeenPwned | ídem #8B |
| **Push notifications** | Exige salir de Expo Go a development build | [`MINISTERIOS.md`](./MINISTERIOS.md) Fase D |
| **Asistencia por ocurrencia de actividad** | Reabre el modelo: necesita tabla de ocurrencias | [`ACTIVIDADES-Y-EVENTOS.md`](./ACTIVIDADES-Y-EVENTOS.md) #7 |
| **Material de lección en Storage** | El bucket `materiales` ya está asegurado y sin usar | `0011` |
| **Reportes** (asistencia/ofrendas, árbol de cascada con CTE) | Fase 3 del roadmap original | `README.md` |

### 10.4 Cómo extender sin romper el diseño

- **¿Nueva pantalla que lee PII?** Primero preguntá qué policy la cubre. Si la
  respuesta es "ninguna, la filtro en el cliente", el diseño está mal.
- **¿La RLS no alcanza para expresar la lectura?** RPC `security definer` con
  validación en la primera línea y el corte de columnas en el `returns table`.
- **¿Nueva columna sensible en `miembros`?** Revisá si tiene que salir por
  `directorio` (probablemente no) y si `guardar_mis_datos` debe poder escribirla.
- **¿Nueva entidad?** Un archivo en `lib/queries/`, con `<entidad>Keys`, hooks e
  `invalidateQueries` explícito. Seguí `discipulados.ts`.
- **¿Tocás un permiso de ministerio?** Es **pertenencia a un conjunto**, nunca
  `registrado_por = auth.uid()`.
- **¿Tocás `registrar_reunion`?** El mismo cambio va en
  `registrar_reunion_ministerio`, y viceversa.
- **¿Nuevo lugar que muestre una descripción recortada?** Pasala por `aTextoPlano()`.
- **¿Dependencia nueva?** Verificá que corra en **Expo Go 57**. Si exige un módulo
  nativo, es una decisión de producto (salir de Expo Go), no un detalle técnico.

---

## 11. Apéndices

### A. Catálogo de migraciones

| # | Archivo | Qué introduce |
|---|---|---|
| 0001 | `schema` | Enums + tablas base + índices |
| 0002 | `rls` | `es_admin`, `es_discipulador_de` + policies iniciales |
| 0003 | `rpc` | `registrar_reunion`, `agregar_discipulo`, trigger `handle_new_user` |
| 0004 | `storage` | Bucket `materiales` |
| 0005 | `discipulador_unico` | 1:1 líder ↔ grupo |
| 0006 | `baja_logica_discipulado` | `motivo_baja`, `fecha_baja` |
| 0007 | `eventos_adjunto` | Adjunto de eventos + bucket público `adjuntos` |
| 0008 | `discipulador_edita_su_grupo` | El líder edita su propio grupo (sin soltarlo ni darlo de baja) |
| 0009 | `miembros_write_scoped` | **Seguridad #2** · `es_discipulador_del_miembro` + write por operación |
| 0010 | `no_autoescalar_rol` | **Seguridad #3** · trigger anti-escalada |
| 0011 | `materiales_scope` | **Seguridad #7** · scoping `<uid>/…` + DELETE |
| 0012 | `roles_expandidos` | `discipulador → obrero`; agrega `pendiente`, `miembro` |
| 0013 | `registro_aprobacion` | Default `pendiente`, `username`, `es_obrero`, `es_miembro_activo`, policies de aprobación |
| 0014 | `directorio` | **Seguridad #1B** · cierra SELECT de `miembros` + vista `directorio` |
| 0015 | `actividades` | Tabla de actividades recurrentes + RLS |
| 0016 | `mis_datos` | `mis_datos()` / `guardar_mis_datos()` |
| 0017 | `directorio_solo_adultos` | Excluye menores de 18 del directorio |
| 0018 | `resolucion_identidad` | `pg_trgm`, `miembro_id` unique, `candidatos_para_perfil`, `resolver_identidad_pendiente`; `guardar_mis_datos` update-only |
| 0019 | `mi_grupo` | `mi_grupo()` y `reuniones_de_mi_grupo()` para el discípulo |
| 0020 | `mostrar_contacto` | Consentimiento de teléfono en el directorio |
| 0021 | `ficha_con_cuenta` | `miembro_tiene_cuenta`, `guardar_notas_miembro`; la ficha con cuenta es de su dueño |
| 0022 | `miembro_activo` | Baja lógica del padrón + `solo_admin_da_de_baja` |
| 0023 | `editar_reunion` | `registrar_reunion` con `p_reunion_id` (edición, fecha incluida) |
| 0024 | `ministerios` | Ministerios, líderes (N:M), roster, helpers, `mis_ministerios`, roster y candidatos, vista `ministerios_lideres` |
| 0025 | `reuniones_ministerio` | Libro contable separado + `registrar_reunion_ministerio` + `reuniones_de_mi_ministerio` |
| 0026 | `anuncios` | Anuncios con alcance, `profiles.anuncios_leidos_hasta`, `anuncios_visibles` |
| 0027 | `nombres_del_padron` | El nombre mostrado sale de `miembros`, no del registro: `nombre_de_perfil` + vista `ministerios_lideres`, `mis_ministerios`, `mi_grupo`, `anuncios_visibles` |
| 0028 | `candidatos_para_discipulado` | Buscar en el padrón a quién sumar al grupo (espejo de `candidatos_para_ministerio`, con umbral de similitud) |
| 0029 | `profiles_columnas_editables` | Cierra el #11: `profiles` solo editable en `rol` y `anuncios_leidos_hasta`; activar pendientes solo por RPC |

### B. Mapa de rutas

| Ruta | Quién llega | Qué hace |
|---|---|---|
| `(auth)/login` | Sin sesión | Login/registro por identificador |
| `pendiente` | `pendiente` | Pantalla de espera |
| `(tabs)/index` | Aprobado | Feed: saludo, actividades de hoy, eventos de la semana, cumpleaños, última predicación, directorio |
| `(tabs)/calendario` | Aprobado | Vista semanal/mensual: eventos en su fecha, actividades repetidas cada semana |
| `(tabs)/discipulado` | Aprobado | "Mi grupo": lo que uno lidera + lo que cursa como discípulo |
| `(tabs)/actividades` | Aprobado | "Eventos y actividades", con buscador |
| `(tabs)/perfil` | Aprobado | Datos, accesos de gestión, stats |
| `aprobaciones` | Obrero/admin | Resolución de identidad de pendientes |
| `directorio` | Miembro+ | Directorio de la congregación |
| `contenido` | Miembro+ | Predicaciones (YouTube) |
| `mis-datos` | Miembro+ | Autogestión de la ficha propia |
| `ofrendas` | Obrero/admin · líder | Desglose de ofrendas. Param `origen`: dos libros, un componente |
| `discipulado/[id]` · `discipulado/discipulos` · `discipulado/historial` · `discipulado/editar` | Líder/admin | Resumen, roster, historial y edición del grupo |
| `mi-grupo/[id]` | Participante | Lectura del grupo propio |
| `reunion/nueva` (modal) · `reunion/[id]` | Líder/admin | Alta/edición y detalle |
| `miembro/[id]` | Obrero/admin | Ficha del padrón (lectura si tiene cuenta) + notas pastorales + baja del discipulado |
| `actividad/[id]` · `actividad-semanal/[id]` | Miembro+ | Detalle de evento / actividad |
| `ministerio/[id]` | Miembro+ | Detalle: una pantalla, tres audiencias (ve que existe / participa / lidera) |
| `ministerio/editar` | Líder/admin | Alta y edición. El picker de líderes es solo para admin |
| `ministerio/integrantes` | Líder/admin | Roster: buscar en el padrón, crear ficha, dar de baja |
| `anuncios` | Miembro+ | Lista + compositor (según lo que uno lidere) |
| `admin/*` | Admin | ABM de usuarios, miembros, discipulados, bajas, **ministerios**, eventos, actividades |

### C. Glosario

| Término | Significa |
|---|---|
| **Padrón** | La tabla `miembros`: todas las personas de la iglesia, tengan cuenta o no |
| **Discipulado** | Grupo recurrente con roster, un líder y asistencia registrada |
| **Discipulador / obrero** | Quien lidera un discipulado. `obrero` es el rol; el poder viene de la asignación |
| **Discípulo** | Persona en el roster de un discipulado (`participaciones`) |
| **Reunión** | Un encuentro concreto, con fecha, tema, asistencia y ofrenda |
| **Actividad** | Ítem de agenda **recurrente semanal**, informativo |
| **Evento** | Actividad **única** con fecha de inicio y fin |
| **Ministerio** | Área/departamento con varios líderes equivalentes |
| **Ficha** | Una fila de `miembros` |
| **Identificador sintético** | El email falso `<slug>@u.appchurch.app` que la app arma para GoTrue |
| **Resolución de identidad** | Enlazar una cuenta pendiente a su ficha del padrón y activarla, en un paso |
