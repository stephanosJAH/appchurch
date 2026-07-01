# App de Discipulados

App móvil de **gestión** de discipulados de una iglesia. La usan solo
**discipuladores** y **administradores**; los discípulos son registros de
miembro sin login.

Basada en `plan-app-discipulados.md`. Este repo cubre **Fase 0 + 1 (MVP)**.

## Stack

- **Expo SDK 54** (React Native 0.81) + **Expo Router** (routing por archivos) — compatible con Expo Go 54
- **Supabase** — Postgres + Auth + RLS + Storage
- **TanStack Query** — estado del servidor
- **NativeWind v4** (Tailwind v3) — estilos
- **@expo/vector-icons** (Ionicons)

## Puesta en marcha

### 1. Backend (Supabase)

Aplicá las migraciones de `supabase/migrations/` en orden (SQL Editor o
`supabase db push`). Detalle en [`supabase/README.md`](supabase/README.md).

Migraciones:

1. `0001_schema.sql` — enums + tablas
2. `0002_rls.sql` — Row Level Security
3. `0003_rpc.sql` — RPCs (`registrar_reunion`, `agregar_discipulo`) + trigger de perfil
4. `0004_storage.sql` — bucket `materiales`

### 2. Credenciales

```bash
cp .env.example .env
```

Completá con tu URL y anon key (Project Settings > API en supabase.com):

```
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3. Primer admin

El trigger crea un perfil `discipulador` por cada usuario nuevo. Para tener un
admin, registrate desde la app y luego, en el SQL Editor:

```sql
update profiles set rol = 'admin'
where id = (select id from auth.users where email = 'tu-email@ejemplo.com');
```

### 4. Correr la app

```bash
npm start          # dev server (escaneá el QR con Expo Go)
npm run android    # emulador/dispositivo Android
npm run ios        # simulador iOS (requiere macOS)
```

## Estructura

```
app/
  (auth)/login.tsx          Login / registro
  (tabs)/                   Inicio, Calendario, Mi grupo, Actividades, Perfil
  discipulado/[id].tsx      Detalle: discípulos + historial + agregar discípulo
  reunion/nueva.tsx         Registrar reunión (asistencia + ofrenda + tema)
  admin/                    ABM de miembros, discipulados y eventos (solo admin)
lib/
  supabase.ts               Cliente Supabase (AsyncStorage + url polyfill)
  auth.tsx                  AuthProvider + useAuth (sesión + perfil + rol)
  types.ts                  Tipos del dominio
  date.ts                   Utilidades de fecha/hora/moneda
  queries/                  Hooks de TanStack Query por entidad
components/ui.tsx           Botón, Field, Card, Badge, etc. (NativeWind)
supabase/migrations/        DDL + RLS + RPC + Storage
```

## Notas del entorno

En esta máquina npm falla por intercepción TLS corporativa
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Para instalar dependencias, agregá el flag
`--strict-ssl=false` a `npm install`. Fix definitivo: exportar la CA corporativa
y setear `NODE_EXTRA_CA_CERTS`.

## Roadmap

- **Fase 2** — subida de documentos a Storage en la reunión, panel admin ampliado.
- **Fase 3** — reportes (asistencia/ofrendas, árbol de cascada con CTE),
  tabla `lecciones`, notificaciones push, offline.
```
