# Seguridad — Hallazgos diferidos (#1 y #8)

> Documento de trabajo. Backlog de seguridad **diferido conscientemente** desde
> la revisión principal ([`SECURITY.md`](./SECURITY.md)). No son "sin acción":
> tienen riesgo residual asumido y pasos concretos para retomarlos.
> Estado: creado 2026-07-12. Stack: Expo SDK 54 + Supabase (seguridad vía RLS).

## Por qué están acá

La app se diseñó con **registro/login sin verificación por email**, porque
muchos miembros de la iglesia no tienen correo. Esa decisión de producto es la
raíz de que el #1 quede diferido, y contamina la parte del #8 que depende del
email. Este documento separa, en cada hallazgo, **lo que depende de esa decisión
de producto** de **lo que NO** y podría resolverse igual.

| # | Severidad | Hallazgo | Bloqueante |
|---|-----------|----------|------------|
| 1 | CRÍTICA | Registro abierto + SELECT de `miembros` expone todo el padrón (PII) | Parcial: la parte de acotar el SELECT NO depende del email |
| 8 | MEDIA | Sin reset de contraseña ni política de fortaleza | Parcial: la fortaleza de contraseña NO depende del email |

---

## 1. CRÍTICA — Registro público abierto + SELECT de `miembros` expone el padrón (PII)

- **Ubicación**: `supabase/migrations/0002_rls.sql:73-74` (policy `miembros_select`),
  `app/(auth)/login.tsx:34-52` (auto-login sin verificación), trigger
  `handle_new_user` en `supabase/migrations/0003_rpc.sql` (asigna rol `discipulador`).
- **Descripción**: El login permite auto-registro sin verificación de email (si
  el signup no devuelve sesión, hace `signInWithPassword` directo). La policy de
  lectura es abierta a cualquier autenticado:
  ```sql
  create policy miembros_select on miembros for select
    using (auth.role() = 'authenticated');
  ```
  Cualquier autenticado lee la tabla completa: nombre, apellido, teléfono, email,
  fecha de nacimiento y notas (`0001_schema.sql:14-24`). PII de toda la congregación.
- **Explotabilidad**: Atacante se registra con cualquier email (o usa la anon key
  pública + endpoint REST directamente), queda autenticado y ejecuta
  `GET /rest/v1/miembros?select=*`. Descarga el padrón sin ser líder de ningún
  grupo. No necesita la app: con URL + anon key basta `curl`.
- **Impacto**: Fuga masiva de datos personales. Posible incumplimiento de la
  Ley 25.326 (datos personales, Argentina).

### Riesgo residual asumido (hoy)

Un usuario autenticado —o cualquiera que se auto-registre— puede leer el padrón
completo. Se asume mientras el registro siga abierto sin verificación.

### Dos partes separables

- **Parte A — depende de producto (BLOQUEADA)**: cerrar el auto-registro o exigir
  confirmación de email, y no auto-loguear tras el signup. Choca de frente con la
  realidad "muchos miembros no tienen correo". Requiere una decisión de producto
  (¿altas solo por admin? ¿verificación por SMS/teléfono en vez de email?).
- **Parte B — NO depende de producto (RETOMABLE YA)**: acotar el SELECT de
  `miembros` a lo que cada líder necesita. Esto reduce la superficie de fuga sin
  tocar el flujo de registro. La creación de discípulos ya puede centralizarse en
  la RPC `agregar_discipulo` (`security definer`), así que no hace falta el SELECT
  global para "sumar un discípulo".

### Remediación de la Parte B (borrador de migración)

```sql
-- Acota la lectura del padrón al líder que gestiona al miembro (o admin).
drop policy if exists miembros_select on miembros;
create policy miembros_select on miembros for select using (
  public.es_admin()
  or public.es_discipulador_del_miembro(id)   -- helper ya creado en 0009
);
```

> El helper `es_discipulador_del_miembro(uuid)` ya existe (lo agregó
> `0009_miembros_write_scoped.sql`), así que la migración de la Parte B es casi
> trivial. **Antes de aplicarla**, verificar qué pantallas listan miembros que el
> usuario NO lidera (p. ej. buscadores globales para "sumar discípulo") y
> migrarlas a la RPC `agregar_discipulo`, o romperán con la nueva policy.

### Verificación al retomar

- [ ] Grepear usos de `.from("miembros").select(` y confirmar que ninguna
      pantalla dependa del SELECT global.
- [ ] Confirmar que "sumar discípulo nuevo" pasa por `agregar_discipulo`.
- [ ] Probar como discipulador no-admin: solo ve miembros de sus grupos.
- [ ] Probar como admin: ve todos.

### Decisión de producto pendiente (Parte A)

- [ ] ¿Se cierra el auto-registro (altas solo por admin)?
- [ ] ¿O se sostiene el registro abierto asumiendo el riesgo, y se mitiga solo con
      la Parte B?
- [ ] ¿Hay alternativa de verificación no-email viable (teléfono/SMS)?

---

## 8. MEDIA — Recuperación de contraseña inexistente y sin política de fortaleza

- **Ubicación**: `app/(auth)/login.tsx:60-62` (`forgotPassword` solo muestra
  "contactá a un admin"), `app/(auth)/login.tsx:23-31` (`submit` no valida
  fortaleza de contraseña).
- **Descripción**: No hay flujo de reset de contraseña. Tampoco validación de
  fortaleza: `submit` solo chequea que el campo no esté vacío, y Supabase por
  defecto exige apenas 6 caracteres.

### Tres partes

- **Parte A — fortaleza de contraseña en el cliente (IN-REPO, sin fricción)**:
  validar en el signup un mínimo razonable (p. ej. ≥ 8 caracteres y no puramente
  numérica) antes de llamar a `supabase.auth.signUp`. No depende del email ni del
  dashboard. Es lo primero a retomar.
- **Parte B — config de dashboard (FUERA DEL REPO)**: en Supabase Auth, subir el
  mínimo de longitud de contraseña y activar la protección de contraseñas
  filtradas (HaveIBeenPwned). Si se hace la Parte C, además configurar la
  **redirect URL** del deep link. Requiere acceso al dashboard.
- **Parte C — reset de contraseña (TENSIÓN DE PRODUCTO)**: un reset por email
  asume que el usuario tiene un correo accesible, lo que choca con la premisa del
  #1. Hay tres caminos posibles (decisión pendiente, ver abajo).

### Opciones para la Parte C

1. **Reset por email (completo)** — `supabase.auth.resetPasswordForEmail(email,
   { redirectTo: "appchurch://reset" })` + handler de deep link + pantalla nueva
   `app/(auth)/reset.tsx` que llame a `supabase.auth.updateUser({ password })`.
   Sirve para quienes tienen correo; los que no, siguen con el fallback de
   "contactá a un admin". Requiere config de redirect URL en el dashboard
   (Parte B).
2. **Gestionado por admin (sin email)** — un admin resetea la contraseña desde la
   app (temp password). No se puede desde el cliente (la Admin API exige
   `service_role`), así que requiere un **Edge Function**. Más infra, pero no
   depende de que el miembro tenga correo. Coherente con el modelo actual
   ("contactá a un admin"), pero automatizado.
3. **Diferir** — mantener "contactá a un admin" como está y solo hacer las Partes
   A y B. Mínima superficie; el reset queda manual.

### Riesgo residual asumido (hoy)

- Sin política de fortaleza, se aceptan contraseñas débiles (mín. 6, sin chequeo
  de filtradas).
- Sin reset self-service, la recuperación depende de contactar a un admin
  (fricción operativa, no un agujero de seguridad en sí).

### Verificación al retomar

- [ ] Parte A: signup rechaza contraseñas < 8 o puramente numéricas, con mensaje claro.
- [ ] Parte B: confirmar en dashboard el nuevo mínimo y HaveIBeenPwned activo.
- [ ] Parte C (si se hace opción 1): el deep link `appchurch://reset` abre la
      pantalla de nueva contraseña y `updateUser` actualiza; probar link vencido.

### Decisión pendiente (Parte C)

- [ ] ¿Opción 1 (email), 2 (admin/Edge Function) o 3 (diferir)?
- [ ] ¿Se tiene acceso al dashboard de Supabase para la Parte B?

---

## Resumen: qué se puede hacer sin decisión de producto

Si en algún momento se quiere avanzar **sin** esperar decisiones de producto, lo
desbloqueado es:

1. **#1 Parte B** — acotar el SELECT de `miembros` al líder (borrador de migración
   arriba; el helper ya existe).
2. **#8 Parte A** — validación de fortaleza de contraseña en el signup del cliente.

Todo lo demás (#1 Parte A, #8 Partes B y C) requiere o una decisión de producto o
acceso al dashboard.
