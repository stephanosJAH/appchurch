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
| Activar `pendiente` → `miembro` | ✗ | ✗ | ✓ | ✓ |
| Asignar `obrero` / `admin` | ✗ | ✗ | ✗ | ✓ |
| Borrar un usuario | ✗ | ✗ | ✗ | ✓ |

> El cambio de rol lo protege un trigger (`no_autoescalar_rol`, evolucionado en
> `0013`): nadie sube su propio rol; el obrero solo puede hacer la activación
> `pendiente→miembro` de **otros**; el admin cambia cualquier rol.

### Personas y PII — `miembros` (tabla base) y `directorio` (vista)

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Leer **directorio** (nombre, apellido, sexo, cumple, teléfono) | ✗ | ✓⁶ | ✓⁶ | ✓⁶ |
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
> apellido, sexo, cumpleaños, teléfono y email — **nunca `notas`** (queda para el
> discipulador/admin). En el primer guardado crean la ficha y la enlazan
> (`profiles.miembro_id`). No aflojan la RLS de `miembros`.
> ⁶ **Solo adultos** (`0017`): la vista excluye a los menores de 18 y a
> cualquier persona sin `fecha_nacimiento` cargada (sin fecha no hay edad, y
> ante la duda no se publica). Los menores siguen visibles para su
> discipulador y el admin por la RLS de `miembros`; al directorio general no
> salen nunca.

### Grupos y reuniones — `discipulados`, `participaciones`, `reuniones`, `asistencias`, ofrendas

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver grupos | ✗ | ✗² | Sus grupos | ✓ |
| Crear grupo / asignar líder | ✗ | ✗ | ✗ | ✓ |
| Editar su propio grupo | ✗ | ✗ | Su grupo | ✓ |
| Gestionar participantes (sumar/quitar) | ✗ | ✗ | Su grupo | ✓ |
| Registrar reuniones y asistencia | ✗ | ✗ | Su grupo | ✓ |
| Registrar/ver ofrendas | ✗ | ✗ | Su grupo | ✓ (todas) |

> ² El `miembro` participa de un grupo pero no lo **gestiona** ni ve el panel de
> gestión; su vínculo se refleja en el directorio/cumpleaños, no en permisos.
> Registrar reunión + asistencias + ofrenda se hace en una sola RPC transaccional
> (`registrar_reunion`), que valida `es_admin() or es_discipulador_de(grupo)`.

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
   solo para el obrero de esa persona y el admin.
4. **Cuenta nueva = inofensiva.** `pendiente` no ve nada hasta que un obrero/admin
   la activa. Por eso el registro abierto deja de ser un agujero (resuelve el #1).
5. **Nadie escala su propio rol.** Trigger en `profiles`; solo el admin asigna
   `obrero`/`admin`, y el obrero solo activa pendientes.

---

## Estado de implementación

Este cuadro describe el **modelo objetivo**. Hoy:

- **Vigente en la DB**: el enum es todavía `('admin','discipulador')`. Las policies
  actuales (`0002` + `0009`/`0010`/`0011`) ya acotan escritura de `miembros`,
  bloquean auto-escalada y aíslan storage — pero con el rol viejo `discipulador`.
- **Pendiente de migrar** (Fase 1 del plan): `0012_roles_expandidos.sql`
  (rename `discipulador→obrero` + add `miembro`/`pendiente`),
  `0013_registro_aprobacion.sql` (default `pendiente`, `username`, helpers
  `es_obrero`/`es_miembro_activo`, trigger de rol matizado, policies de aprobación)
  y `0014_directorio.sql` (cierra el SELECT del padrón + vista `directorio`).
- **Pendiente en la app** (Fases 2-4): gate de `pendiente` en el shell, pantalla de
  aprobación para obreros, `useDirectorio()`, rename de UI `discipulador→obrero`.
- **Follow-ups** (Fase 5): anuncios, reset de contraseña por admin (Edge Function),
  config de dashboard (mínimo de contraseña, HaveIBeenPwned).

Cuando se apliquen 0012-0014 y se completen las fases, esta matriz pasa a reflejar
lo efectivamente vigente.
