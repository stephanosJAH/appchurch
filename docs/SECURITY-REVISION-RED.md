# Segunda revisión de seguridad — features de "red-iglesia"

> Documento de trabajo. Estado: revisión post-features (fecha 2026-07-19).
> Alcance revisado: los 12 commits de la rama `main` sin pushear que extienden
> la app a toda la congregación — roles expandidos, registro con aprobación,
> resolución de identidad, directorio y actividades. En concreto las migraciones
> `0009`–`0018` y `lib/authIdentity.ts`, `lib/supabase.ts`, `lib/storage.ts`,
> `app/(auth)/login.tsx`.
> Continúa la numeración de [`SECURITY.md`](./SECURITY.md) (hallazgos #1–#10).
> Marcá cada ítem con `[ ]` pendiente / `[x]` resuelto a medida que se trabaja.

## Índice de estado

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 11 | ALTA | `profiles.miembro_id` es auto-editable → un miembro se enlaza a la ficha de otro (IDOR de PII, R/W) | [ ] pendiente |

**El patrón de fondo**: este PR convierte a `profiles.miembro_id` en una **clave
de autorización** (las RPCs `mis_datos`/`guardar_mis_datos` de `0016`/`0018`
leen y escriben la ficha de `miembros` que ese link apunta), pero la policy que
gobierna la edición del propio perfil (`prof_update_self`, `0002`) nunca acotó
las columnas. El trigger anti-autoescalada solo cuida `rol`, no `miembro_id`.

---

## 11. ALTA — `profiles.miembro_id` auto-editable: enlace a la ficha de otra persona (IDOR)

- **Ubicación**:
  - Policy permisiva: `supabase/migrations/0002_rls.sql:25-26` (`prof_update_self`).
  - Clave de autorización nueva: `supabase/migrations/0016_mis_datos.sql:38-42`
    (`mis_datos`) y `0018_resolucion_identidad.sql:210-224` (`guardar_mis_datos`).
  - Fuente de UUIDs objetivo: `supabase/migrations/0017_directorio_solo_adultos.sql:22-27`
    (la vista `directorio` expone `id` de `miembros`).
  - Único guard de columna existente: trigger `no_autoescalar_rol`
    (`0010`/`0013`) — solo protege `rol`.

- **Descripción**: Las RPCs nuevas resuelven "cuál es mi ficha" **únicamente** por
  el `miembro_id` del perfil del que llama:

  ```sql
  -- mis_datos() — 0016_mis_datos.sql
  select m.id, m.nombre, ... m.email
  from miembros m join profiles p on p.miembro_id = m.id
  where p.id = auth.uid();
  ```

  Pero `prof_update_self` deja actualizar el propio perfil **sin restricción de
  columnas**:

  ```sql
  create policy prof_update_self on profiles for update
    using (id = auth.uid()) with check (id = auth.uid());
  ```

  El trigger `no_autoescalar_rol` bloquea cambios de `rol`, pero **no** de
  `miembro_id`. Cualquier autenticado puede ejecutar, con la anon key pública y
  su propia sesión:

  ```
  PATCH /rest/v1/profiles?id=eq.<su_id>   {"miembro_id": "<uuid ajeno>"}
  ```

  El `unique (miembro_id)` de `0018` solo exige que la ficha destino no esté ya
  enlazada — condición que cumple **toda la congregación que aún no se registró**
  (la mayoría del padrón).

- **Explotabilidad**:
  1. La atacante es una miembro aprobada (`rol='miembro'`), estado normal de
     cualquier congregante.
  2. Consulta la vista `directorio` (permitida a todo miembro activo) → obtiene el
     `id` (uuid de `miembros`) de cualquier **adulto** del padrón cuya ficha no
     esté enlazada a una cuenta.
  3. Reapunta su enlace: `UPDATE profiles SET miembro_id='<uuid víctima>' WHERE
     id=auth.uid()`. Pasa `prof_update_self` (`id=auth.uid()`), no toca `rol` (el
     trigger no dispara) y el `unique` pasa porque la ficha está libre.
  4. Llama `mis_datos()` → recibe la ficha de la víctima **incluyendo `email`**
     (dato que el directorio NO expone).
  5. Llama `guardar_mis_datos(...)` → **sobrescribe** nombre, apellido, sexo,
     fecha de nacimiento, teléfono y email de la ficha ajena.

- **Impacto**:
  - **Lectura cruzada de PII**: el `email` del padrón (no expuesto por el
    directorio) queda accesible fila por fila.
  - **Escritura cruzada / integridad**: vandalismo del padrón; además deja la
    ficha "secuestrada" (enlazada a la atacante), de modo que cuando la persona
    real se registre, el obrero no podrá enlazarla en la aprobación
    (`resolver_identidad_pendiente` corta con "ya está enlazada").
  - Alcanzable por cualquier usuario de bajo privilegio, sin condiciones
    especiales más que tener cuenta aprobada. Los menores quedan fuera del vector
    directo (sus uuids no salen por el directorio y los UUID son inadivinables),
    pero cualquier adulto del padrón es objetivo.

- **Remediación** (cualquiera de las dos cierra el hueco; preferible el trigger,
  por consistencia con `no_autoescalar_rol`):

  **Opción A — trigger (recomendada).** El enlace legítimo ya se hace solo vía
  `resolver_identidad_pendiente()` (security definer, `auth.uid()` NULL adentro no
  aplica; corre como definer). El cliente nunca necesita tocar la columna:

  ```sql
  create or replace function public.no_reenlazar_miembro()
  returns trigger language plpgsql set search_path = public as $$
  begin
    if new.miembro_id is distinct from old.miembro_id
       and auth.uid() is not null
       and not es_admin() then
      raise exception 'No podés cambiar el enlace de tu ficha';
    end if;
    return new;
  end $$;

  -- Reusar el mismo trigger que ya valida rol, o uno nuevo BEFORE UPDATE.
  ```

  > Nota: `resolver_identidad_pendiente` es `security definer` y hace
  > `update profiles set miembro_id=...`. Bajo un definer, `auth.uid()` sigue
  > devolviendo al obrero que llama (no NULL), así que hay que permitir ese caso.
  > Como el obrero es `es_obrero()` pero no necesariamente `es_admin()`, ajustar
  > la condición para permitir también a `es_obrero()` **solo** cuando el perfil
  > destino es `pendiente` (mismo criterio que `no_autoescalar_rol`), o marcar la
  > RPC para saltar el trigger. Verificar en pruebas que la aprobación sigue
  > funcionando tras agregar el trigger.

  **Opción B — privilegio de columna:**

  ```sql
  revoke update (miembro_id) on profiles from authenticated;
  -- (deja editables el resto de columnas del propio perfil)
  ```

  La Opción B es la más simple si `resolver_identidad_pendiente` corre como
  definer con privilegios de dueño (no sujeta al grant de `authenticated`), lo que
  hay que confirmar.

- **Estado (2026-07-19)**: PENDIENTE.

---

## Verificado como correcto (sin acción)

Estos cambios del PR se auditaron y quedaron bien:

- **Cifrado de sesión — `lib/supabase.ts` (`LargeSecureStore`)**: AES-256-CTR con
  **clave aleatoria nueva por cada escritura** guardada en SecureStore. Aunque el
  counter arranca fijo en 1, no hay reuso de keystream porque la clave es única
  por operación. Patrón oficial de Supabase, correcto. (Cierra el #4 de `SECURITY.md`.)
- **Adjuntos — `lib/storage.ts`**: path con `Crypto.randomUUID()` (128 bits),
  extensión sanitizada a `[a-z0-9]{,8}`, y `abrirAdjunto` restringe a `^https://`
  antes de `Linking.openURL`. (Cierra #5 y #6.)
- **Anti-autoescalada de rol — `0013`**: la auto-promoción `pendiente→miembro` o
  `→admin` por cuenta propia está bloqueada por el trigger `no_autoescalar_rol`
  (`new.id <> auth.uid()`, `es_admin()`), aun si la policy `prof_obrero_activar`
  es permisiva a nivel de fila. Un `pendiente` que intente auto-activarse cae en
  el `raise exception`.
- **Directorio — `0014` → `0017`**: `0017` corrige, dentro del mismo PR, la
  exposición de menores y de fichas sin `fecha_nacimiento` que traía `0014`. El
  `where es_miembro_activo() and fecha_nacimiento <= (current_date - interval '18
  years')` deja fuera a `pendiente` (0 filas) y a menores. Estado neto seguro.
- **Email sintético — `lib/authIdentity.ts`**: el `username` es client-controlled
  pero **no es frontera de autorización** (todo el backend usa `auth.uid()`). Las
  colisiones de identificador no permiten takeover: seguís necesitando la
  contraseña de la cuenta destino. La normalización NFD solo cambia qué cadenas
  colisionan (dedupe intencional), no habilita suplantación.
- **RPCs de identidad — `0018`**: `candidatos_para_perfil` y
  `resolver_identidad_pendiente` validan `es_obrero()` adentro, enmascaran el
  teléfono (últimos 4) y son atómicas. Un obrero no puede activarse a sí mismo
  (el target debe ser `pendiente`, y el trigger corta el auto-cambio).

---

## Pendiente de verificar en dashboard / entorno

- Confirmar que el grant por defecto de Supabase da `UPDATE` a `authenticated`
  sobre `public.profiles` (asumido para el hallazgo #11; es el default de
  Supabase). Si por algún motivo estuviera revocado a nivel de columna, el
  vector #11 no aplicaría — verificarlo.
- Que RLS siga habilitado en todas las tablas nuevas (`actividades` lo declara en
  `0015`).
