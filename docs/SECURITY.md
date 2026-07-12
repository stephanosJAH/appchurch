# Revisión de seguridad — App "Discipulados" / appchurch

> Documento de trabajo. Estado: revisión inicial (fecha 2026-07-05).
> Stack: Expo SDK 54 + expo-router + Supabase (sin backend propio; toda la
> seguridad de datos recae en RLS y en las policies de Storage).
> Marcá cada ítem con `[ ]` pendiente / `[x]` resuelto a medida que se trabaja.

## Índice de estado

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | CRÍTICA | Registro abierto + RLS `miembros` expone todo el padrón (PII) | [—] diferido → [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md) |
| 2 | CRÍTICA | `miembros_write` permite editar/borrar cualquier miembro | [x] `0009_miembros_write_scoped.sql` |
| 3 | ALTA | Auto-escalada a admin vía `prof_update_self` | [x] `0010_no_autoescalar_rol.sql` |
| 4 | ALTA | Token de sesión en AsyncStorage (no SecureStore) | [x] `lib/supabase.ts` (LargeSecureStore) |
| 5 | ALTA | Bucket `adjuntos` público con URLs no firmadas | [x] público por diseño + entropía UUID (`lib/storage.ts`) |
| 6 | MEDIA | `Linking.openURL` sin validar esquema | [x] `abrirAdjunto` (`lib/storage.ts`) |
| 7 | MEDIA | Storage `materiales` sin scoping ni DELETE | [x] `0011_materiales_scope.sql` |
| 8 | MEDIA | Sin reset de contraseña ni política de fortaleza | [—] diferido → [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md) |
| 9 | BAJA | Anon key en `eas.json` (aceptable, depende de RLS) | [ ] |
| 10 | BAJA | Sin certificate pinning | [ ] |

**El patrón de fondo**: la app delega correctamente la autorización al backend,
pero las policies de RLS tienen agujeros que anulan esa protección. Como
cualquiera puede auto-registrarse, esos agujeros son alcanzables por un atacante
anónimo con solo la anon key pública (embebida en el bundle y en `eas.json`).

---

## 1. CRÍTICA — Registro público abierto + RLS de `miembros` expone todo el padrón (PII)

- **Ubicación**: `supabase/migrations/0002_rls.sql:73-77`, `app/(auth)/login.tsx:37-51`, trigger `handle_new_user` en `supabase/migrations/0003_rpc.sql:84-96`.
- **Descripción**: El login permite auto-registro sin verificación de email (si el signup no devuelve sesión, hace `signInWithPassword` directo). El trigger asigna rol `discipulador` a cualquiera. La policy de lectura es:
  ```sql
  create policy miembros_select on miembros for select
    using (auth.role() = 'authenticated');
  ```
  Cualquier autenticado lee la tabla completa: nombre, apellido, teléfono, email, fecha de nacimiento y notas (`0001_schema.sql:14-24`). PII de toda la congregación.
- **Explotabilidad**: Atacante se registra con cualquier email (o usa la anon key pública + endpoint REST directamente), queda autenticado y ejecuta `GET /rest/v1/miembros?select=*`. Descarga el padrón sin ser líder de ningún grupo. No necesita la app: con URL + anon key basta `curl`.
- **Impacto**: Fuga masiva de datos personales. Posible incumplimiento de la Ley 25.326 (datos personales, Argentina).
- **Remediación**:
  1. Deshabilitar auto-registro abierto o exigir confirmación de email (Supabase Auth → Email → "Confirm email"), y no auto-loguear tras signup.
  2. Restringir SELECT de `miembros` a lo que cada líder necesita:
     ```sql
     drop policy miembros_select on miembros;
     create policy miembros_select on miembros for select using (
       es_admin() or exists (
         select 1 from participaciones p
         join discipulados d on d.id = p.discipulado_id
         where p.miembro_id = miembros.id and d.discipulador_id = auth.uid()
       )
     );
     ```
     Para "sumar discípulo nuevo", usar la RPC `agregar_discipulo` (ya `security definer`) en vez de dar SELECT global.
- **Estado (2026-07-08)**: DIFERIDO por decisión de producto. La app se diseñó
  con registro/login **sin verificación por email** porque muchos miembros de la
  iglesia no tienen correo. En consecuencia, el SELECT de `miembros` sigue abierto
  a cualquier autenticado. **Riesgo residual asumido**: un usuario autenticado (o
  auto-registrado) puede leer el padrón completo. La parte de acotar el SELECT al
  líder (remediación 2) NO dependía del email y podría retomarse por separado si se
  decide endurecer la lectura.

## 2. CRÍTICA — `miembros_write` permite a cualquier autenticado modificar/borrar cualquier miembro

- **Ubicación**: `supabase/migrations/0002_rls.sql:75-77`.
- **Descripción**:
  ```sql
  create policy miembros_write on miembros for all
    using (es_admin() or auth.role() = 'authenticated')
    with check (es_admin() or auth.role() = 'authenticated');
  ```
  `for all` incluye INSERT, UPDATE y DELETE. La condición `auth.role() = 'authenticated'` hace irrelevante el `es_admin()`: cualquier logueado puede actualizar o borrar cualquier fila.
- **Explotabilidad**: `DELETE /rest/v1/miembros?id=eq.<uuid>` o reescritura de datos ajenos. Por `on delete cascade` en `participaciones` y `asistencias` (`0001_schema.sql:56,82`), borrar un miembro arrastra su historial.
- **Impacto**: Borrado masivo del padrón por un usuario común; vandalismo/sabotaje.
- **Remediación**: Separar INSERT de UPDATE/DELETE y acotar a admin o al líder que gestiona a ese miembro:
  ```sql
  drop policy miembros_write on miembros;
  create policy miembros_insert on miembros for insert
    with check (auth.role() = 'authenticated');
  create policy miembros_mutate on miembros for update
    using (es_admin() /* or pertenencia al líder */)
    with check (es_admin() /* or ... */);
  create policy miembros_delete on miembros for delete using (es_admin());
  ```
  Idealmente centralizar la creación en la RPC `agregar_discipulo`.
- **Estado (2026-07-08)**: RESUELTO en `supabase/migrations/0009_miembros_write_scoped.sql`.
  Se reemplazó la policy `for all` por tres policies:
  - `miembros_insert` (INSERT): `auth.role() = 'authenticated'`. La creación real
    pasa por la RPC `agregar_discipulo` (security definer); el INSERT abierto es
    necesario para que el `upsert` de edición pase el check y no rompe nada crítico
    (a lo sumo permite insertar un miembro huérfano, sin borrado ni PII ajena).
  - `miembros_update` (UPDATE): `es_admin() or es_discipulador_del_miembro(id)`
    (nuevo helper `security definer`). Preserva la edición del discipulador sobre
    los miembros de su grupo (`miembro/[id].tsx`).
  - `miembros_delete` (DELETE): solo `es_admin()`. Cierra el borrado masivo con cascada.
  - **Endurecimiento opcional futuro**: pasar el INSERT a solo-admin y cambiar el
    edit del cliente de `.upsert()` a `.update()`.

## 3. ALTA — Auto-escalada de privilegios: un usuario puede promoverse a admin

- **Ubicación**: `supabase/migrations/0002_rls.sql:25-26`.
- **Descripción**:
  ```sql
  create policy prof_update_self on profiles for update
    using (id = auth.uid()) with check (id = auth.uid());
  ```
  El comentario dice "no el rol", pero la policy NO impide cambiar la columna `rol`. El `with check` solo valida que la fila siga siendo la propia. Cualquier autenticado puede `UPDATE profiles SET rol='admin' WHERE id = auth.uid()`.
- **Explotabilidad**: `PATCH /rest/v1/profiles?id=eq.<su_id>` con `{"rol":"admin"}`. Al pasar `es_admin()`, obtiene control total.
- **Impacto**: Escalada de privilegios completa.
- **Remediación**: Trigger que bloquea el cambio de `rol` salvo para admins:
  ```sql
  create or replace function public.no_cambiar_rol()
  returns trigger language plpgsql as $$
  begin
    if not es_admin() and new.rol is distinct from old.rol then
      raise exception 'No podés cambiar tu rol';
    end if;
    return new;
  end $$;
  create trigger trg_no_cambiar_rol before update on profiles
    for each row execute function public.no_cambiar_rol();
  ```
- **Estado (2026-07-08)**: RESUELTO en `supabase/migrations/0010_no_autoescalar_rol.sql`.
  Trigger `BEFORE UPDATE` sobre `profiles` (`no_autoescalar_rol`) que rechaza el
  cambio de `rol` salvo que el actor sea admin. Se agregó el guard
  `auth.uid() is not null` que faltaba en el snippet original: sin él, el trigger
  bloqueaba el **bootstrap del primer admin** por SQL Editor (ahí `auth.uid()` es
  NULL y `es_admin()` daría false). Preserva el cambio de rol legítimo desde
  `app/admin/usuarios.tsx` (actor admin) y el bootstrap por SQL Editor.

## 4. ALTA — Token de sesión almacenado en AsyncStorage en lugar de SecureStore

- **Ubicación**: `lib/supabase.ts:16-23`.
- **Descripción**: El cliente persiste la sesión (access token + refresh token de larga vida) en AsyncStorage, que en Android es almacenamiento en texto plano en el sandbox de la app. En dispositivo rooteado, backup extraíble o malware con acceso al storage, el refresh token queda expuesto.
- **Explotabilidad**: Con acceso físico/root se lee el refresh token y se obtienen access tokens válidos indefinidamente (no expiran salvo rotación/revocación), suplantando al usuario.
- **Impacto**: Robo de sesión persistente; con un admin comprometido, control total del backend.
- **Remediación**: Usar `expo-secure-store` como storage adapter. La sesión de Supabase supera el límite de 2048 bytes de SecureStore, así que usar el patrón `LargeSecureStore` (chunking) documentado por Supabase:
  ```ts
  import * as SecureStore from "expo-secure-store";
  // getItem/setItem/removeItem partiendo el valor en chunks
  createClient(url, key, { auth: { storage: LargeSecureStore, ... } });
  ```
  Funciona en Expo Go 54; no bloquea el flujo actual.
- **Estado (2026-07-09)**: RESUELTO en `lib/supabase.ts`. Se implementó el patrón
  oficial de Supabase (AES-256): clave aleatoria en SecureStore (keystore) +
  valor cifrado en AsyncStorage, vía la clase `LargeSecureStore`. Dependencias
  agregadas (todas Expo Go 54): `expo-secure-store`, `expo-crypto` (aleatoriedad,
  en vez de `react-native-get-random-values` para no meter un módulo nativo fuera
  de Expo Go) y `aes-js` (+ `@types/aes-js` dev).
  - **Efecto en usuarios existentes**: la sesión vieja quedaba en AsyncStorage en
    texto plano; al no haber clave en el keystore, `_decrypt` la ignora → **un
    único re-login** y a partir de ahí la sesión queda cifrada. Autoresuelto.

## 5. ALTA — Bucket `adjuntos` público con URLs no firmadas

- **Ubicación**: `supabase/migrations/0007_eventos_adjunto.sql:14-29`, consumido en `lib/storage.ts:27-42`.
- **Descripción**: Bucket `public: true` con SELECT `using (bucket_id = 'adjuntos')` sin restricción. Cualquiera con la URL accede sin autenticación. Nombres `${Date.now()}-${random 6 chars}.ext` (`storage.ts:33`): baja entropía (6 chars base36).
- **Explotabilidad**: Adjuntos accesibles por URL pública indefinidamente. Si a futuro se sube material no público, quedaría expuesto.
- **Impacto**: Bajo si el contenido es siempre público (flyers); alto si un admin sube algo sensible.
- **Remediación**: Si no es estrictamente público, bucket privado + `createSignedUrl`. Si debe ser público, documentarlo y aumentar entropía del path (`crypto.randomUUID()` vía `expo-crypto`).
- **Estado (2026-07-09)**: RESUELTO por decisión de producto. Los adjuntos son
  flyers/anuncios de eventos pensados para difusión, así que el bucket sigue
  **público por diseño** (evita el refactor a URLs firmadas, que las 5 pantallas
  que muestran `adjunto_url` como `<Image>` complicarían por expiración/caché).
  Se cerró el punto explotable — la **baja entropía** del path (`Date.now()` +
  6 chars base36 ≈ 31 bits, enumerable) — generando ahora el nombre con
  `Crypto.randomUUID()` (128 bits) en `lib/storage.ts:subirAdjunto`, más
  sanitización de la extensión. Las policies de `0007` (lectura pública, escritura
  solo admin) quedan como están. Los adjuntos ya subidos conservan su path viejo
  (impacto menor); solo las subidas nuevas usan UUID.

## 6. MEDIA — `adjunto_url` abierto con `Linking.openURL` sin validar el esquema

- **Ubicación**: `app/actividad/[id].tsx:106`.
- **Descripción**: `adjunto_url` viene de la base y se abre sin validar `https://`. Hoy solo admins escriben ese campo (policy `ev_write`), pero no hay defensa en profundidad: `javascript:`, `file://`, `intent://` podrían dispararse.
- **Impacto**: Redirección a esquemas peligrosos / apertura de apps arbitrarias.
- **Remediación**:
  ```ts
  const url = evento.adjunto_url!;
  if (/^https:\/\//i.test(url)) Linking.openURL(url);
  ```
- **Estado (2026-07-09)**: RESUELTO. Se centralizó la apertura en el helper
  `abrirAdjunto(url)` (`lib/storage.ts`): valida `^https://` antes de
  `Linking.openURL` y, si no lo es (o falla), muestra un aviso en vez de disparar
  el esquema. `app/actividad/[id].tsx:106` ahora llama a `abrirAdjunto(evento.adjunto_url)`
  (se quitó el `Linking.openURL` directo y el import de `Linking` que quedó sin uso).
  Es el único `Linking.openURL` de la app (`enlace_virtual` no se abre por Linking).

## 7. MEDIA — Storage `materiales` sin policy de DELETE y sin scoping por dueño

- **Ubicación**: `supabase/migrations/0004_storage.sql:10-18`.
- **Descripción**: Cualquier autenticado puede leer y sobrescribir (UPDATE) cualquier archivo del bucket, no solo los suyos. Sin control por carpeta/dueño.
- **Explotabilidad**: Un líder puede sobrescribir el material de otro grupo.
- **Remediación**: Acotar por prefijo de carpeta (`(storage.foldername(name))[1] = auth.uid()::text`) o por pertenencia, y agregar la policy de DELETE correspondiente.
- **Estado (2026-07-10)**: RESUELTO en `supabase/migrations/0011_materiales_scope.sql`.
  Contexto: el bucket `materiales` **no se usa todavía** (scaffolding de "Fase 2";
  `reuniones.material_url` siempre se guarda `null` y no hay código que suba ahí),
  así que se aseguró preventivamente. INSERT/UPDATE/DELETE quedan acotados a
  `public.es_admin()` o al dueño de la carpeta (`(storage.foldername(name))[1] =
  auth.uid()::text`), y se agregó la policy de DELETE que faltaba. La lectura sigue
  para cualquier autenticado (bucket privado, requiere sesión/URL firmada).
  - **A tener en cuenta al construir Fase 2**: subir bajo `<auth.uid()>/...`
    (ej. `upload(\`${user.id}/leccion.pdf\`, ...)`), o el `with check` rechaza el alta.

## 8. MEDIA — Recuperación de contraseña inexistente y sin política de contraseñas

- **Ubicación**: `app/(auth)/login.tsx:60-62`.
- **Descripción**: "¿Olvidó su contraseña?" solo muestra "contactá a un admin". Sin flujo de reset. Sin validación de fortaleza (Supabase por defecto exige solo 6 caracteres).
- **Remediación**: Implementar `supabase.auth.resetPasswordForEmail` con deep link. Subir el mínimo de contraseña en Auth. Habilitar protección de contraseñas filtradas (HaveIBeenPwned) en Supabase.
- **Estado (2026-07-12)**: DIFERIDO. Se movió el detalle, la separación en partes
  (fortaleza in-repo vs. reset con tensión de producto) y los pasos para retomarlo
  a [`SECURITY-DIFERIDOS.md`](./SECURITY-DIFERIDOS.md), junto con el #1. La fortaleza
  de contraseña en el cliente (#8 Parte A) no depende del email y podría retomarse
  sola.

## 9. BAJA — Anon key y URL hardcodeadas en `eas.json` versionado

- **Ubicación**: `eas.json:12-33`, `.env.local:3-4`.
- **Descripción**: La anon key está en `eas.json` (commiteado). Es aceptable por diseño (la anon key es pública y se embebe en el bundle). El riesgo real no es la key sino que su seguridad depende 100% de RLS.
- **Verificación positiva**: No se expone la `service_role` en el repo. El JWT del `.env.local` dice `"role":"anon"` (correcto).
- **Remediación**: Ninguna sobre la key; la acción es endurecer RLS (hallazgos 1-3).

## 10. BAJA — No hay certificate pinning

- **Ubicación**: transporte Supabase (`lib/supabase.ts`).
- **Descripción**: Todo HTTPS con `*.supabase.co` (bien, sin cleartext). Sin pinning: un atacante con CA instalada en el dispositivo (MITM) podría inspeccionar tráfico.
- **Impacto**: Bajo para el modelo de amenaza típico.
- **Remediación**: Opcional. Requiere config nativa (development build). No prioritario frente a RLS.

---

## Verificaciones OK (sin acción)

- **Deep links / URL schemes**: `scheme: "appchurch"` en `app.json:8` sin handlers de `Linking.addEventListener` ni parsing de params que ejecuten acciones sensibles. Sin universal/app links. Sin superficie de ataque.
- **Permisos**: `app.json` no declara cámara, ubicación, contactos ni notificaciones. Solo `expo-document-picker` (sin permiso peligroso en SDK 54). Mínimo privilegio respetado.
- **Inyección SQL**: Queries vía query builder de supabase-js o RPCs parametrizadas (`0003_rpc.sql`). Las RPCs son `security definer` pero validan autorización (`es_admin() or es_discipulador_de(...)`). Sin SQLite local.
- **WebView**: No se usa ninguna. Sin `injectedJavaScript`/XSS.
- **Logs**: `console.log` de sesión todos bajo `if (__DEV__)` (`lib/auth.tsx`, `lib/query-logger.ts`). No llegan a producción.
- **Autorización cliente vs backend**: `isAdmin` en cliente (`lib/auth.tsx:103`) solo para UI; la autorización real está en RLS (patrón correcto, condicionado a corregir 1-3).

---

## Fuera de alcance del repo (verificar en dashboard Supabase)

- Confirmación de email habilitada o no.
- Mínimo de longitud/fortaleza de contraseña.
- Que RLS esté efectivamente habilitado en TODAS las tablas en el entorno productivo.
- Protección de contraseñas filtradas (HaveIBeenPwned).

---

## Plan sugerido (orden de ataque)

1. **Cerrar escalada de privilegios y registro abierto** (#3 + #1, config Auth): trigger anti-cambio de `rol` + desactivar auto-login sin verificación de email. Sin esto, cualquiera es admin en un PATCH.
2. **Rehacer policies de `miembros`** (#1 + #2): acotar SELECT al líder; quitar UPDATE/DELETE global (DELETE solo admin). Es la fuga de PII y el riesgo de sabotaje.
3. **Migrar la sesión a `expo-secure-store`** (#4): patrón `LargeSecureStore` de Supabase (compatible con Expo SDK 54).
4. Resto: #5-#8 según prioridad; #9-#10 informativos.
