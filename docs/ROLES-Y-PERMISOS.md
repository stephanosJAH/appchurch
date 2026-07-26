# Roles y permisos — App Discipulados

> Documento de referencia. Modelo objetivo de roles y alcances de la app como red
> de toda la iglesia. Estado: creado 2026-07-13.
> Fuente: [`PLAN-RED-IGLESIA.md`](./PLAN-RED-IGLESIA.md) + la RLS del esquema
> (`supabase/migrations/`). Ver **Estado de implementación** al final: parte de
> esto es diseño objetivo aún no migrado.

## Los roles

`rol_app` = `('admin', 'obrero', 'miembro', 'pendiente')`.

| Rol | Qué es | Acceso base |
|---|---|---|
| **`pendiente`** | Cuenta recién registrada, sin aprobar | **Nada** — pantalla "esperá aprobación" |
| **`miembro`** | Congregante aprobado | Red: eventos, anuncios, cumpleaños, directorio |
| **`obrero`** | Líder/discipulador (ex `discipulador`) | Lo de `miembro` + gestión **de su gente/grupos** |
| **`admin`** | Administrador | Todo, incluida la gestión de usuarios y roles |

> **Principio clave**: el poder de gestión de un grupo NO viene del nombre del rol,
> sino de la **asignación** (`discipulados.discipulador_id = auth.uid()`). `obrero`
> es el tier que un admin otorga a un líder; sus permisos concretos se acotan a los
> grupos que efectivamente lidera.

---

## Resumen: qué ve y qué puede cada rol

| | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| **Ve la red** (eventos, anuncios, cumpleaños) | ✗ | ✓ | ✓ | ✓ |
| **Ve el directorio** (nombre + cumple + teléfono) | ✗ | ✓ | ✓ | ✓ |
| **Ve PII sensible** (email, notas pastorales) | ✗ | ✗ | Solo **su gente** | ✓ (todos) |
| **Gestiona grupos** (miembros, reuniones, asistencia) | ✗ | ✗ | Solo **sus grupos** | ✓ (todos) |
| **Activa pendientes** | ✗ | ✗ | ✓ | ✓ |
| **Administra usuarios y roles** | ✗ | ✗ | ✗ | ✓ |

Leyenda de alcance en las matrices siguientes:
- **✓** = permitido siempre · **✗** = denegado
- **su gente** = personas en algún grupo que el obrero lidera (`es_discipulador_del_miembro`)
- **su grupo** = el grupo que el obrero lidera (`es_discipulador_de(discipulado_id)`)
- **propio** = solo la fila/carpeta del propio usuario

---

## Matriz detallada por recurso

### Identidad y usuarios — `profiles`

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver perfil propio | ✓ | ✓ | ✓ | ✓ |
| Ver otros perfiles | ✗ | ✗ | Solo `pendiente` (para aprobar) | ✓ |
| Editar perfil propio (sin rol) | ✓ | ✓ | ✓ | ✓ |
| Cambiar el **propio** rol | ✗ | ✗ | ✗ | ✓ |
| Activar `pendiente` → `miembro` | ✗ | ✗ | ✓⁷ | ✓⁷ |
| Asignar `obrero` / `admin` | ✗ | ✗ | ✗ | ✓ |
| Borrar un usuario | ✗ | ✗ | ✗ | ✓ |

> El cambio de rol lo protege un trigger (`no_autoescalar_rol`, evolucionado en
> `0013`): nadie sube su propio rol; el obrero solo puede hacer la activación
> `pendiente→miembro` de **otros**; el admin cambia cualquier rol.
> ⁷ **La activación es resolución de identidad, no un toggle** (`0018`,
> RPC `resolver_identidad_pendiente`): no hay UPDATE directo de `rol` para
> pendientes. El obrero enlaza la cuenta a una ficha existente del padrón
> (candidatos por `candidatos_para_perfil`) o crea una nueva; `miembro_id`
> queda seteado siempre antes de activar. `profiles.miembro_id` es
> `unique`, así que una ficha del padrón no puede enlazarse dos veces.

### Personas y PII — `miembros` (tabla base) y `directorio` (vista)

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Leer **directorio** (nombre, apellido, sexo, cumple, teléfono⁸) | ✗ | ✓⁶ | ✓⁶ | ✓⁶ |
| Leer **PII completa** (+ email, notas) de la tabla `miembros` | ✗ | ✗ | Su gente | ✓ |
| Crear miembro (alta de discípulo) | ✗ | ✗ | Su grupo¹ | ✓ |
| Editar miembro (cualquiera) | ✗ | ✗ | Su gente | ✓ |
| Editar **sus propios** datos (sin notas) | ✗ | Propio⁵ | Propio | Propio |
| Borrar miembro | ✗ | ✗ | ✗ | ✓ |

> ¹ El alta real pasa por la RPC `agregar_discipulo` (security definer, valida que
> seas el líder del grupo destino o admin). La vista `directorio` expone **solo** el
> subconjunto seguro; email y notas nunca salen por ahí.
> ⁵ Autogestión desde el perfil (`app/mis-datos.tsx`) por las RPC security-definer
> `mis_datos` / `guardar_mis_datos` (`0016`), acotadas a `auth.uid()`. Editan nombre,
> apellido, sexo, cumpleaños, teléfono, email y `mostrar_contacto` (`0020`) —
> **nunca `notas`** (queda para el discipulador/admin). Desde `0018` son
> update-only: la ficha ya viene enlazada de la activación, y una cuenta sin
> `miembro_id` recibe un error en vez de crear un duplicado. No aflojan la
> RLS de `miembros`.
> ⁶ **Solo adultos** (`0017`): la vista excluye a los menores de 18 y a
> cualquier persona sin `fecha_nacimiento` cargada (sin fecha no hay edad, y
> ante la duda no se publica). Los menores siguen visibles para su
> discipulador y el admin por la RLS de `miembros`; al directorio general no
> salen nunca.
> ⁸ **El teléfono sale solo con consentimiento** (`0020`): la vista lo
> publica según `miembros.mostrar_contacto`, que la propia persona controla
> desde "Mis datos". En `false` la fila sigue apareciendo (nombre y
> cumpleaños) pero `telefono` llega `null`. Default `true` — preserva lo que
> la congregación veía antes de la migración. El flag es de la vista: su
> discipulador y el admin siguen viendo el teléfono en `miembros`, que es el
> contacto pastoral.

### Grupos y reuniones — `discipulados`, `participaciones`, `reuniones`, `asistencias`, ofrendas

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver grupos | ✗ | Solo el **suyo**² | Sus grupos | ✓ |
| Ver historial de reuniones (fecha, tema, presentes) | ✗ | Su grupo² | Sus grupos | ✓ |
| Crear grupo / asignar líder | ✗ | ✗ | ✗ | ✓ |
| Editar su propio grupo | ✗ | ✗ | Su grupo | ✓ |
| Gestionar participantes (sumar/quitar) | ✗ | ✗ | Su grupo | ✓ |
| Registrar reuniones y asistencia | ✗ | ✗ | Su grupo | ✓ |
| Registrar/ver ofrendas, notas y material | ✗ | ✗² | Su grupo | ✓ (todas) |

> ² El `miembro` **ve** su grupo pero no lo **gestiona**. Lectura por dos RPC
> security-definer (`0019`), porque la RLS de estas tablas es solo líder/admin:
> `mi_grupo()` (resuelve `auth.uid() → profiles.miembro_id → participaciones
> activas → discipulados activos`) y `reuniones_de_mi_grupo(id)`, que exige
> participación activa en ese grupo y devuelve **solo** fecha, tema y nombres de
> los presentes. Ofrenda, notas y material quedan fuera del `returns table`: el
> corte es del backend, no de la UI. Sin `profiles.miembro_id` enlazado
> (cuentas previas a `0018`) ambas devuelven vacío.
> Registrar reunión + asistencias + ofrenda se hace en una sola RPC transaccional
> (`registrar_reunion`), que valida `es_admin() or es_discipulador_de(grupo)`.
>
> **Nota de PII**: la lista de presentes es la única superficie donde un
> `miembro` ve a un **menor de edad** (el `directorio` los excluye desde `0017`).
> Se acota a nombre y apellido — sin teléfono, sin cumpleaños, sin edad — y solo
> entre gente del mismo grupo.

### Contenido de la red — `eventos` / actividades, `anuncios`

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver eventos vigentes | ✗³ | ✓ | ✓ | ✓ |
| Crear / editar / borrar eventos | ✗ | ✗ | ✗⁴ | ✓ |
| Ver anuncios *(planificado, Fase 5)* | ✗ | ✓ | ✓ | ✓ |
| Publicar anuncios *(planificado, Fase 5)* | ✗ | ✗ | ✓ | ✓ |

> ³ El bloqueo del `pendiente` para contenido no sensible (eventos) es a nivel de
> **UI** (el shell muestra la pantalla de espera). El PII (miembros/directorio) sí
> está cerrado por RLS. Un `pendiente` no llega a ninguna pantalla útil.
> ⁴ Hoy los eventos los escribe **solo admin** (`ev_write`). Si se quiere que un
> obrero cree eventos de su grupo (`tipo='discipulado'`), es una extensión a decidir.

### Storage (archivos)

| Bucket | Leer | Escribir / borrar |
|---|---|---|
| **`adjuntos`** (flyers de eventos) | Público (cualquiera con la URL) | Solo `admin` |
| **`materiales`** (material de lección, Fase 2) | Autenticado (`miembro`+) | Dueño de la carpeta (`<uid>/…`) o `admin` |

> `adjuntos` es **público por diseño** (difusión de flyers), con nombres UUID no
> enumerables. `materiales` es privado y aún no se usa desde la app.

---

## Principios que rigen todo

1. **La autorización vive en el backend (RLS + RPCs), no en el cliente.** El
   `isAdmin`/`esObrero` del cliente es solo para mostrar/ocultar UI.
2. **Gestión = asignación, no rol.** Ser `obrero` no da acceso global; da acceso a
   *tus* grupos y *tu* gente. El admin es el único con alcance total.
3. **PII en capas.** Directorio (nombre+cumple+tel) para todo miembro; email/notas
   solo para el obrero de esa persona y el admin. El teléfono del directorio,
   además, es del que lo comparte: se publica solo si la persona lo habilita
   (`mostrar_contacto`, `0020`).
4. **Cuenta nueva = inofensiva.** `pendiente` no ve nada hasta que un obrero/admin
   la activa. Por eso el registro abierto deja de ser un agujero (resuelve el #1).
5. **Nadie escala su propio rol.** Trigger en `profiles`; solo el admin asigna
   `obrero`/`admin`, y el obrero solo activa pendientes.

---

## Estado de implementación

Este cuadro describe el **modelo objetivo**. Hoy:

- **Vigente en la DB**: `0012`-`0018` aplicadas. Enum `rol_app` con
  `admin`/`obrero`/`miembro`/`pendiente`, registro con aprobación (`0013`),
  directorio solo-adultos (`0014`+`0017`), autogestión de datos propios (`0016`,
  update-only desde `0018`) y activación como resolución de identidad
  (`0018`: `candidatos_para_perfil` + `resolver_identidad_pendiente`,
  `profiles.miembro_id` `unique`). `0019` suma la lectura del grupo propio
  para el `miembro` (`mi_grupo` + `reuniones_de_mi_grupo`), que es lo que
  alimenta el tab "Mi grupo" cuando quien mira no lidera nada.
- **Escrita, pendiente de aplicar**: `0020` (`miembros.mostrar_contacto` +
  vista `directorio` publicando el teléfono solo con consentimiento). La app
  ya manda `p_mostrar_contacto`: hasta que corra la migración, guardar desde
  "Mis datos" falla, porque la función vieja no acepta ese argumento.
- **Pendiente en la app**: gate de `pendiente` en el shell más allá del
  redirect a `/pendiente`, y separar la UI de `miembro` de la de `obrero`
  (hoy buena parte de la navegación todavía gatea con `isAdmin`/`esObrero`
  sin un tier propio para `miembro`).
- **Follow-ups** (Fase 5): anuncios, reset de contraseña por admin (Edge
  Function), config de dashboard (mínimo de contraseña, HaveIBeenPwned).

Cuando se complete la separación de UI por tier, esta matriz pasa a reflejar
lo efectivamente vigente end-to-end.
