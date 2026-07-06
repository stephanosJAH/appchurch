# Bugs y mejoras — App Discipulados

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
