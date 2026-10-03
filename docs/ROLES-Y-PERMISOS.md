# Roles y permisos — pdapp

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
| Editar los **datos** de un miembro | ✗ | ✗ | Su gente **sin cuenta**⁹ | ✓ |
| Escribir la **descripción** (`notas`) de un miembro | ✗ | ✗ | Su gente | ✓ |
| Editar **sus propios** datos (sin notas) | ✗ | Propio⁵ | Propio | Propio |
| Borrar miembro | ✗ | ✗ | ✗ | ✓ |

> ¹ El alta real pasa por la RPC `agregar_discipulo` (security definer, valida que
> seas el líder del grupo destino o admin). La vista `directorio` expone **solo** el
> subconjunto seguro; email y notas nunca salen por ahí. Antes del alta va la
> búsqueda: `candidatos_para_discipulado` (`0028`, mismo gate) deja ver
> **nombre, apellido y teléfono enmascarado** de gente del padrón que todavía no
> es "su gente" — el mínimo para reconocerla y sumarla en vez de duplicarle la
> ficha. Sumar a alguien que ya está en el padrón no es un alta: es un insert en
> `participaciones`, que la policy del grupo ya autoriza.
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
> ⁹ **La ficha de quien tiene cuenta es suya** (`0021`): en cuanto
> `profiles.miembro_id` apunta a esa persona, la RLS le corta el UPDATE al
> discipulador (`miembros_update` suma `not miembro_tiene_cuenta(id)`) y los
> datos personales pasan a editarse solo por `guardar_mis_datos`. Antes los
> dos caminos escribían la misma fila y el discipulador podía pisar —sin
> enterarse— lo que la persona acababa de corregir, incluido su
> `mostrar_contacto`. La **lectura** no cambia: sigue viendo la PII completa
> de su gente. Las notas del seguimiento sí le quedan: se escriben por la RPC
> `guardar_notas_miembro` (definer, solo esa columna), que es la contracara
> exacta de `guardar_mis_datos` (edita todo menos `notas`). El **admin no
> pierde nada**: es el ABM del padrón y quien corrige por quien no puede.
> En la app: `app/miembro/[id].tsx` muestra la ficha como vista resumida de
> solo lectura (sin inputs) + la tarjeta **"Notas"** con el editor de texto
> enriquecido, y `app/admin/miembros.tsx` conserva el formulario completo.
> Esa nota es **privada del discipulador y del admin**: la persona no la ve
> (`mis_datos()` no devuelve `notas`) y nadie más puede leer la ficha
> (`miembros_select`, `0014`).

### Grupos y reuniones — `discipulados`, `participaciones`, `reuniones`, `asistencias`, ofrendas

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver grupos | ✗ | Solo el **suyo**² | Sus grupos | ✓ |
| Ver historial de reuniones (fecha, tema, presentes) | ✗ | Su grupo² | Sus grupos | ✓ |
| Crear grupo / asignar líder | ✗ | ✗ | ✗ | ✓ |
| Editar su propio grupo | ✗ | ✗ | Su grupo | ✓ |
| Gestionar participantes (sumar/quitar) | ✗ | ✗ | Su grupo | ✓ |
| Registrar y editar reuniones y asistencia | ✗ | ✗ | Su grupo | ✓ |
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
> La misma RPC edita una reunión ya cargada si se le pasa `p_reunion_id`
> (`0023`): ahí la fecha también es editable y el permiso se chequea contra el
> `discipulado_id` **guardado en la reunión**, no contra el que venga por
> parámetro. Editar no está separado de registrar como permiso: quien puede
> cargar la reunión de su grupo puede corregirla. **Borrar no existe** para
> nadie, ni admin.
>
> **Nota de PII**: la lista de presentes es la única superficie donde un
> `miembro` ve a un **menor de edad** (el `directorio` los excluye desde `0017`).
> Se acota a nombre y apellido — sin teléfono, sin cumpleaños, sin edad — y solo
> entre gente del mismo grupo.

### Ministerios — `ministerios`, `ministerio_lideres`, `ministerio_miembros`, `reuniones_ministerio`

Un ministerio es un **área o departamento** (jóvenes, alabanza, acción social).
Acá el rol casi no interviene: **la columna que manda es "líder del ministerio"**,
y un líder de ministerio **puede ser `miembro`**. Ver [`MINISTERIOS.md`](./MINISTERIOS.md).

| Acción | `miembro` | Participante | **Cualquier líder** | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver que el ministerio existe | ✓ | ✓ | ✓ | ✓ |
| Ver quiénes lo lideran | ✓ | ✓ | ✓ | ✓ |
| Ver el roster | ✗ | ✗ | ✓ | ✓ |
| Crear ministerio / darlo de baja | ✗ | ✗ | ✗ | ✓ |
| Sumar / quitar líderes | ✗ | ✗ | ✗⁵ | ✓ |
| Editar nombre, ícono y descripción | ✗ | ✗ | ✓ | ✓ |
| Sumar / quitar integrantes | ✗ | ✗ | ✓ | ✓ |
| Registrar reuniones + ofrenda | ✗ | ✗ | ✓ | ✓ |
| **Editar una reunión o anuncio de otro líder** | ✗ | ✗ | **✓** | ✓ |
| Ver el historial de reuniones | ✗ | ✓⁶ | ✓ | ✓ |
| Publicar anuncios del ministerio | ✗ | ✗ | ✓ | ✓ |

> **La diferencia de fondo con `discipulados`**: allá el permiso es una
> **igualdad** contra un dueño único (`discipulador_id = auth.uid()`); acá es
> **pertenencia a un conjunto** (`es_lider_de_ministerio()`, `0024`). De ahí sale,
> sin lógica extra, que todo lo que puede hacer un líder lo pueden hacer todos.
> Lo que sí se conserva es **quién hizo cada cosa**, como dato y no como candado:
> `reuniones_ministerio.registrado_por` y `anuncios.autor_id` guardan al autor
> original y no se pisan cuando otro líder edita (el trigger
> `trg_anuncios_conserva_autor` lo garantiza para anuncios). **Si aparece un
> `registrado_por = auth.uid()` en una condición de permiso de ministerio, está mal.**
>
> ⁵ Único punto donde los líderes **no** son autosuficientes: quién entra al
> conjunto lo decide el admin (`minlid_admin`), para que un líder no se vuelva
> administrador de hecho de su área sumando cuentas. Es el diferido #6 de
> `MINISTERIOS.md`.
> ⁶ Fecha, tema y presentes — **sin ofrenda ni notas**, igual que
> `reuniones_de_mi_grupo()`. El corte va en el `returns table` del RPC
> (`reuniones_de_mi_ministerio`), no en la UI.
>
> **Roster y padrón**: el líder no puede leer `miembros` (la RLS de `0014` lo
> reserva a admin y al discipulador de esa persona) ni usar `directorio` (excluye
> menores desde `0017`, justo la población de jóvenes y adolescentes). Por eso el
> roster, la búsqueda de candidatos y el alta de una ficha nueva van por RPC
> definer: `integrantes_de_mi_ministerio`, `candidatos_para_ministerio` y
> `agregar_integrante_ministerio`. Lo que el líder ve del padrón es **nombre,
> apellido y teléfono según `mostrar_contacto`** — sin email, sin notas, sin
> fecha de nacimiento.
>
> **Contabilidad separada**: las ofrendas de ministerio viven en
> `reuniones_ministerio`, no en `reuniones` (decisión de producto, `0025`). Son
> dos libros y no se mezclan; `app/ofrendas.tsx` los muestra con un parámetro
> `origen`.

### Contenido de la red — `eventos` / actividades, `anuncios`

| Acción | `pendiente` | `miembro` | `obrero` | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver eventos vigentes | ✗³ | ✓ | ✓ | ✓ |
| Crear / editar / borrar eventos | ✗ | ✗ | ✗⁴ | ✓ |
| Ver anuncios generales (toda la iglesia) | ✗ | ✓ | ✓ | ✓ |
| Ver anuncios de un ministerio | ✗ | Solo su gente | Solo su gente | ✓ |
| Publicar anuncios generales | ✗ | ✗ | ✗ | ✓ |
| Publicar / editar / borrar anuncios de un ministerio | ✗ | ✗⁷ | ✗⁷ | ✓ |

> ⁷ No es una cuestión de rol: los anuncios de un ministerio los publica
> **cualquiera de sus líderes** (sea `miembro` u `obrero`), y los generales, solo
> el admin. La policy `anun_write` (`0026`) ramifica por `ministerio_id`: null
> exige `es_admin()`, con uuid acepta `es_lider_de_ministerio()`. El aviso es
> **in-app** (sección en el feed + badge contra `profiles.anuncios_leidos_hasta`);
> el push al celular con la app cerrada quedó fuera de alcance a propósito
> (exige salir de Expo Go).

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
   *tus* grupos y *tu* gente. El admin es el único con alcance total. Con
   ministerios el principio se lleva hasta el final: un líder de ministerio
   **puede ser `miembro`**, así que la UI tampoco se gatea por rol — se pregunta
   por el resultado de `mis_ministerios()` (`soy_lider`), no por `esObrero`.
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
  alimenta el tab "Mi grupo" para cualquier rol: esa pantalla es personal
  (lo que uno lidera + lo que cursa como discípulo), y el padrón completo
  de discipulados vive solo en Admin > Discipulados.
- **Escrita, pendiente de aplicar**: `0024`-`0028` (ministerios, su libro de
  reuniones, los anuncios, el nombre del padrón y la búsqueda de candidatos para
  un discipulado). El cliente ya las consume: hasta que corran, el hub "Mi grupo",
  la campana de anuncios y el buscador del roster van a fallar con *function does
  not exist*. Regla de siempre: **migración primero, app después**.
  `0027` redefine objetos de `0019`/`0024`/`0026`, así que va después de ellas.
- **Pendiente en la app**: gate de `pendiente` en el shell más allá del
  redirect a `/pendiente`, y terminar de separar la UI de `miembro` de la de
  `obrero` (fuera de ministerios, buena parte de la navegación todavía gatea con
  `isAdmin`/`esObrero` sin un tier propio para `miembro`).
- **Follow-ups**: reset de contraseña por admin (Edge Function), config de
  dashboard (mínimo de contraseña, HaveIBeenPwned) y push real de anuncios
  (Fase D de `MINISTERIOS.md`, exige development build).

Cuando se complete la separación de UI por tier, esta matriz pasa a reflejar
lo efectivamente vigente end-to-end.
