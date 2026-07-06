# Web App para usuarios iOS — Plan de desarrollo

> **Objetivo:** publicar la app como **web app** para que los usuarios de iPhone
> entren desde el navegador (Safari), sin pagar todavía la cuenta de Apple
> Developer. Cuando tengamos feedback y el OK, se paga la cuenta y se sube la app
> nativa a la App Store. La web queda como acceso alternativo permanente.
>
> **Rama de trabajo:** `feat/web-app-ios`
> **Fecha del análisis:** 2026-07-05
> **Stack:** Expo SDK 54 + expo-router 6 + Supabase + NativeWind. Ver `AGENTS.md`
> (no subir el SDK sin confirmar: Expo Go 54 no corre apps de SDK 55+).

---

## 0. Estado de partida (bueno)

El proyecto **ya está preparado para web**, no requiere cambio de arquitectura:

- `app.json` → `web.bundler: "metro"` ya configurado.
- `expo-router` genera salida web out-of-the-box.
- Script `npm run web` ya existe (`expo start --web`).

El único desarrollo **obligatorio** es un wrapper de fecha para 3 pantallas
(ver §2). Todo lo demás es configuración, deploy y QA.

---

## 1. Resumen de la auditoría de dependencias

| Estado | Dependencia | Impacto | Acción |
|--------|-------------|---------|--------|
| 🔴 Bloqueante | `@react-native-community/datetimepicker` | No tiene UI web; rompe en Safari | Wrapper `DatePicker` con `<input type="date">` (§2) |
| 🟡 Probar | `expo-document-picker` (`lib/storage.ts`) | Funciona en web, hay que testear el upload | QA del flujo adjuntar flyer/PDF (§5) |
| 🟢 OK | `AsyncStorage` (sesión Supabase) | Usa `localStorage` en web automáticamente | Ninguna |
| 🟢 OK | `Linking.openURL` (`app/actividad/[id].tsx`) | Hace `window.open` en web | Ninguna |
| 🟢 OK | `KeyboardAvoidingView` (`components/ui.tsx`) | Ramas solo android/ios; no-op en web | QA teclado en Safari (§5) |
| 🟢 OK | reanimated, gesture-handler, safe-area-context, url-polyfill, nativewind, expo-status-bar | Compatibles con web | Ninguna |
| ⚪ Muerta | `react-native-calendars` | En `package.json` pero **no se importa**; calendario hecho a mano | Opcional: borrar del `package.json` |

**Conclusión:** alcance de código real ≈ 1 componente nuevo + 3 call-sites.
El resto es configuración y pruebas.

---

## 2. TAREA PRINCIPAL — Wrapper `DatePicker` (web + nativo)

### Problema
`@react-native-community/datetimepicker` no renderiza en web. Se usa en 3
pantallas, las tres con el mismo patrón: un `Pressable` que abre el picker +
`<DateTimePicker mode="date">`.

### Call-sites a migrar

| Archivo | Línea aprox. | Campo |
|---------|-------------|-------|
| `app/reunion/nueva.tsx` | 86 | Fecha de la reunión |
| `app/admin/eventos.tsx` | 186 | Fecha del evento |
| `app/miembro/[id].tsx` | 187 | Fecha del miembro |

### Enfoque propuesto
Crear un componente único (p. ej. `components/DatePicker.tsx`) que:

- En **web** (`Platform.OS === "web"`): renderice un `<input type="date">`
  estilado acorde al design system, trabajando en formato ISO `YYYY-MM-DD`
  (que es el que ya usan las pantallas: `fechaToDate` / `dateToFecha` /
  `todayISO` en `lib/date.ts`).
- En **iOS/Android**: mantenga el `@react-native-community/datetimepicker`
  actual (mismo comportamiento `display="inline"` iOS / `"default"` Android).
- Exponga una API común: `value: string (ISO)`, `onChange: (iso) => void`,
  y opcionalmente el label/trigger.

De esta forma las 3 pantallas quedan idénticas y el `Platform.OS` vive en un
solo lugar.

### Notas de implementación
- Metro hace tree-shaking por plataforma con la extensión `.web.tsx`; una
  alternativa más limpia es `DatePicker.tsx` (nativo) + `DatePicker.web.tsx`
  (web) para que el bundle web ni siquiera incluya el paquete nativo.
- Respetar el formato de fecha ISO que ya circula en la app para no tocar la
  lógica de guardado.
- Revisar que el locale/formato de `<input type="date">` no rompa el parseo
  (el input siempre entrega `YYYY-MM-DD`, así que alcanza con mapear directo).

**Esfuerzo estimado:** chico-medio (1 componente + 3 reemplazos + prueba).

---

## 3. Configuración de salida web

- Definir el tipo de output en `app.json` → `web.output`:
  - **`single` (SPA)** — recomendado. Una sola página, ideal para app con login.
  - `static` — pre-renderiza rutas (mejor SEO); innecesario para app interna.
- Verificar favicon (`web.favicon` ya apunta a `./assets/favicon.png`).
- Confirmar que las rutas de `expo-router` resuelven en web (deep links,
  parámetros dinámicos como `[id]`).

---

## 4. Variables de entorno y Supabase

- Las credenciales usan prefijo `EXPO_PUBLIC_` → quedan disponibles en el bundle
  web automáticamente. Ya están en `eas.json` (build profiles) y deberían estar
  en `.env` local.
- Asegurar que el **hosting** inyecte `EXPO_PUBLIC_SUPABASE_URL` y
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` en el build.
- En el **dashboard de Supabase** → Authentication → URL Configuration:
  - Agregar la URL del sitio web a **Site URL** y **Redirect URLs**.
  - Necesario si a futuro se usan magic links / reset de contraseña. Con login
    email+password actual no es bloqueante, pero conviene dejarlo listo.

---

## 5. QA en iPhone real (Safari) — checklist

Probar en un iPhone físico (no solo el simulador ni Chrome desktop):

- [ ] **Login** email/password + persistencia de sesión al recargar.
- [ ] **DatePicker web** en las 3 pantallas (reunión, evento, miembro).
- [ ] **Adjuntar flyer/PDF** (`expo-document-picker` + upload a bucket
      `adjuntos` de Supabase) → verificar que el `blob:` URI se sube bien.
- [ ] **Abrir adjunto** (`Linking.openURL` en `app/actividad/[id].tsx`).
- [ ] **Teclado tapando inputs** — comportamiento distinto en Safari vs nativo
      (bug ya trabajado en nativo; revisar `KeyboardScrollView`).
- [ ] **Safe areas / notch**, scroll con bounce, `100vh` vs viewport real de
      Safari (barra de direcciones que aparece/desaparece).
- [ ] **Calendario** (vista semana/mes hecha a mano) se ve y navega bien.
- [ ] Flujos de **admin** (ABM miembros, resumen mensual, ofrendas).

---

## 6. Build y deploy

### Build local de prueba
```
npx expo export --platform web      # genera dist/
```
Servir `dist/` localmente para revisar antes de publicar.

### Hosting (elegir uno)
- **EAS Hosting** — integrado con Expo (`eas deploy`), da URL `*.expo.app`.
  Camino más natural con el stack Expo. **No requiere cuenta de Apple.**
- **Vercel / Netlify / Cloudflare Pages** — gratis, dominio custom fácil,
  buen fit para salida estática `dist/`.

> Definir dominio: subdominio propio de la iglesia vs URL provista por el host.

---

## 7. "Sentirse app" en iOS (opcional, recomendado)

Para que los usuarios lo agreguen a la pantalla de inicio y se vea a pantalla
completa (sin barra de Safari):

- Configurar **PWA / web manifest**: `apple-touch-icon`, `display: standalone`,
  `theme-color`, nombre corto.
- Documentar para los usuarios el gesto:
  **Safari → Compartir → "Agregar a inicio"**.

---

## 8. Orden de ejecución sugerido

1. **(Opcional primero)** `expo export` de prueba para ver la web tal cual está
   y confirmar que todo salvo los datepickers se ve bien en Safari.
2. **§2** — Wrapper `DatePicker` (única tarea de código obligatoria).
3. **§3** — Configurar `web.output`.
4. **§4** — Env vars + Redirect URLs en Supabase.
5. **§6** — Deploy a hosting (EAS Hosting o Vercel).
6. **§5** — QA completo en iPhone real.
7. **§7** — PWA / add-to-home-screen + instrucciones a usuarios.

---

## 9. Fuera de alcance / a decidir

- Quitar `react-native-calendars` del `package.json` (dependencia muerta) —
  cosmético, se puede hacer en cualquier momento.
- Cuenta de Apple Developer + submit a App Store → **fase posterior**, cuando
  haya feedback y presupuesto.
- Dominio custom definitivo.
