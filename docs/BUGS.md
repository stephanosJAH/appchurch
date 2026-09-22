# Bugs y mejoras — pdapp

Registro de problemas detectados durante las pruebas, para ir corrigiéndolos.

**Estados:** 🔴 pendiente · 🟡 en progreso · 🟢 resuelto · ⚪ a confirmar

---

## 🟡 BUG-01 — La info no termina de cargar al iniciar sesión / carga muy lenta
- **Área:** Login / arranque de la app (auth + queries). Se ve claro con los discipulados: al abrir la app no cargan; recién aparecen al navegar por los tabs. **No es problema del rol.**
- **Descripción:** Al loguearse, no se carga toda la información; aparece incompleta. Después de un rato termina de cargar. Al desloguear y volver a loguear, tarda muchísimo.
- **Impacto:** Alto — primera impresión de la app, parece que no funciona.
- **Hipótesis principal:** las queries (`useDiscipulados`, etc.) **no están gateadas por la sesión**. En arranque en frío pueden dispararse antes de que el cliente de Supabase adjunte el token restaurado desde AsyncStorage → RLS devuelve `[]` → con `staleTime: 30s` ese vacío queda cacheado. Al navegar (o pasados 30s) refetchea y trae datos. A confirmar con los logs.
- **Instrumentación agregada (solo `__DEV__`):**
  - `lib/query-logger.ts` + wiring en `app/_layout.tsx`: loguea `[query] ▶/✔/✖ <key> — <ms>ms — <n> fila(s)` por cada query.
  - `lib/auth.tsx`: loguea tiempos de `getSession`, carga de perfil y eventos `onAuthStateChange`.
  - Cómo ver: `npm start` + Expo Go → los logs salen en la terminal de Metro.
- **Causa CONFIRMADA (logs de arranque en frío):** el access token guardado está vencido. `supabase-js` arranca y `getSession()` devuelve `null` (~787ms) mientras refresca por detrás → `loading` pasa a `false`, se montan los tabs y las queries salen **sin token** → RLS devuelve `[]` → con `staleTime: 30_000` el vacío queda cacheado. Recién después llega `onAuthStateChange: SIGNED_IN` con el token bueno, pero nadie re-invalidaba las queries. (`eventos` traía 1 fila porque su RLS es público; discipulados/miembros/reuniones volvían en `0`.) Cerrar/abrir lo "arreglaba" porque la 2ª vez el token ya está fresco en memoria.
- **Fix aplicado (`lib/auth.tsx`):** el `AuthProvider` usa `useQueryClient` y, cuando la sesión pasa de sin-token a con-token (o cambia de usuario) en `getSession`/`onAuthStateChange`, llama `qc.invalidateQueries()`. Eso fuerza el refetch con el token ya adjunto y le gana al `staleTime`. Se unificó el manejo de sesión en `syncSession()`.
- **Estado:** 🟢 fix aplicado — **falta verificar en dispositivo**: arrancar en frío (con token vencido) y confirmar que discipulados/miembros/reuniones cargan solos, sin navegar entre tabs. En los logs debería verse `[auth] ↻ token disponible (SIGNED_IN) — invalidando queries` seguido del refetch con filas > 0.

## 🟡 BUG-02 — Los inputs quedan detrás del teclado
- **Área:** Formularios (Login; campos al cargar un discipulado; y todos los forms en general)
- **Descripción:** Al enfocar un campo, el teclado tapa el input y no se ve lo que se escribe.
- **Reproducción:** (1) Login. (2) Cargar un discipulado y escribir en el campo de nota/descripción.
- **Impacto:** Medio-alto — afecta usabilidad de la carga de datos.
- **Causa raíz:** `KeyboardScrollView` usaba solo `automaticallyAdjustKeyboardInsets`, que **es no-op en Android**; con `edgeToEdgeEnabled` el teclado tapa el contenido. El Login usaba `behavior={undefined}` en Android.
- **Fix aplicado:** se envolvió en `KeyboardAvoidingView` con `behavior="padding"` para Android (iOS sigue con `automaticallyAdjustKeyboardInsets`, que ahí anda bien):
  - `components/ui.tsx` → `KeyboardScrollView` (cubre eventos, reunión nueva, discipulado editar/detalle, miembro).
  - `app/(auth)/login.tsx` → `behavior="padding"`.
  - `app/admin/miembros.tsx` → `FlatList` envuelto en `KeyboardAvoidingView`.
  - `actividades` (buscador) queda arriba de todo, no lo tapa el teclado.
- **Estado:** 🟡 aplicado — **falta verificar en dispositivo Android**. Si con edge-to-edge algún campo sigue tapado (posible doble ajuste con `softwareKeyboardLayoutMode: resize`), la solución robusta es migrar a `react-native-keyboard-controller` (requiere dev build, no corre en Expo Go).

## 🟡 BUG-03 — `column m.activo does not exist` al buscar a quién sumar al grupo
- **Área:** Supabase / aplicación de migraciones. Se ve en `app/discipulado/[id].tsx` al buscar en el padrón (`useCandidatosDiscipulado` → RPC `candidatos_para_discipulado`, 0028).
- **Descripción:** la búsqueda falla siempre: `[query] ✖ ["participaciones","<id>","candidatos","<texto>"] — 1800ms — column m.activo does not exist`.
- **Reproducción:** entrar a un discipulado → "sumar discípulo" → tipear 2+ letras.
- **Impacto:** Alto — deja sin salida el único camino que evita la ficha duplicada, que es justo lo que 0028 vino a arreglar.
- **Causa CONFIRMADA:** **`0022_miembro_activo.sql` nunca se aplicó a la base.** El error sale de adentro del cuerpo de la RPC, o sea que la función existe y el guard `es_admin() or es_discipulador_de()` pasó: no es permisos. Su única referencia a `m.activo` es `from miembros m where m.activo`, y esa columna la agrega solo 0022.
- **Por qué no se detectó al instalar 0028:** PL/pgSQL **no valida referencias a columnas en el `create function`**, solo la sintaxis. La función se crea perfecta contra una base sin la columna y recién falla en la primera llamada. Es la trampa general del setup: las migraciones se aplican a mano por el SQL Editor, no hay tabla de migraciones, y saltearse una no da error **hasta que la usás, desde la app, con un mensaje que no nombra ninguna migración**.
- **Lo que rompe la misma causa:**
  - `candidatos_para_ministerio` (0024) tiene el `from miembros m where m.activo` idéntico → buscar a quién sumar al roster de un ministerio falla igual. Sirve para confirmar el diagnóstico.
  - `directorio` queda en la versión de 0020: la gente dada de baja sigue apareciendo en el directorio y en los cumpleaños, y falta el trigger `trg_solo_admin_da_de_baja`. Cualquier `update miembros set activo = false` falla con el mismo mensaje.
- **Fix:** aplicar `supabase/migrations/0022_miembro_activo.sql` entero en el SQL Editor. Es idempotente y es seguro fuera de orden: recrea la vista `directorio`, pero 0022 es la última migración que la toca (0023-0028 no la redefinen), así que no pisa nada más nuevo.
- **Prevención aplicada (`supabase/README.md`):** el listado de migraciones estaba desactualizado (llegaba hasta 0011) — así es como se saltea una. Se completó hasta 0028 y se agregó la sección "Verificar qué está aplicado", con una query que dice qué objetos faltan.
- **Estado:** 🟡 diagnóstico cerrado, **falta aplicar 0022 en la base** y reconfirmar que la búsqueda anda (en discipulados y en ministerios).

---

## Plantilla para nuevos ítems
```
## 🔴 BUG-XX — Título corto
- **Área:**
- **Descripción:**
- **Reproducción:**
- **Impacto:**
- **Causa probable:**
- **Estado:** 🔴 pendiente
```
