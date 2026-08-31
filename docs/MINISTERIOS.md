# Ministerios — modelo y decisiones

> Documento de referencia. Fija qué es un **ministerio**, por qué no se modela
> como un `discipulado` ni reusa su tabla de reuniones, y en qué orden se
> construye. Estado: creado 2026-08-19; **fases A, B y C implementadas
> 2026-08-30** (`0024`-`0026` + cliente). La D (push) sigue fuera de alcance.
> Lo que se desvió del diseño de acá está anotado en
> [Qué se construyó](#qué-se-construyó).
> Relacionado: [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md),
> [`ACTIVIDADES-Y-EVENTOS.md`](./ACTIVIDADES-Y-EVENTOS.md) (diferidos #5 y #8),
> [`PLAN-RED-IGLESIA.md`](./PLAN-RED-IGLESIA.md) (anuncios, Fase 5).

## Qué es

Un **área o departamento** de la iglesia: jóvenes, adolescentes, acción social,
alabanza. Tiene **varios líderes —todos con las mismas atribuciones—**, gente
que **participa**, se junta y
**registra esas reuniones** (con asistencia y, a veces, ofrenda), y necesita
**avisarle cosas a su gente**.

Es la cuarta "cosa" del dominio, junto a `discipulados`, `actividades` y
`eventos`. No reemplaza a ninguna.

## Por qué no es un `discipulado` con un `tipo`

Sería tentador: mismo roster, mismo líder, mismas reuniones. Se descarta porque
la tabla `discipulados` está construida alrededor de supuestos que un ministerio
no cumple:

- `dia_semana`, `hora_inicio` y `sexo` son **`not null`**. Acción social no tiene
  día fijo; un ministerio no es "de varones" o "de mujeres".
- El líder es **1:1** (`discipulados_discipulador_unico`, `0005`). Quien lidera
  jóvenes puede además tener su propio discipulado, y un ministerio suele tener
  líder + colíder.
- Aflojar esas columnas rompe a todos los consumidores que hoy hacen
  `DIAS_SEMANA[d.dia_semana]` sin preguntar (inicio, calendario, `MiGrupo`), y
  metería ministerios dentro de `mi_grupo()` sin quererlo.

El vocabulario tampoco sobrevive: "discipulador", "discípulos", "Mi grupo".

## Por qué tampoco reusa la tabla `reuniones`

**Decisión de producto (2026-08-19): la contabilidad va separada en la base.**
Las ofrendas de ministerio no comparten tabla con las de discipulado.

La alternativa evaluada era una `reuniones` polimórfica (`discipulado_id` /
`ministerio_id` con un `check` de arco exclusivo), que habría dado el desglose
por origen gratis y una sola implementación del RPC. Se eligió la separación
física: son dos libros distintos y no se mezclan por accidente.

**Lo que cuesta y cómo se acota**: `asistencias` cuelga de `reuniones`, así que
separar una obliga a separar la otra, y con ella el RPC transaccional — que no es
trivial (upsert idempotente de `0003` + diff de asistencias al editar de `0023`).

- El **SQL se duplica**, y las dos funciones quedan marcadas como espejo en su
  cabecera: **una corrección en una va sí o sí en la otra**.
- La **UI no se duplica**: el formulario (`app/reunion/nueva.tsx`) y el detalle
  (`app/reunion/[id].tsx`) son los mismos campos, así que se comparten y
  ramifican por un parámetro `origen`; lo único que cambia es qué hook de
  mutación se llama.

## Modelo de datos

### `0024_ministerios.sql` — identidad, líderes y roster

```sql
create table ministerios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,                       -- admite marcas (lib/richText.ts)
  icono       text,                       -- nombre de ionicon, para la UI
  activo      boolean not null default true,
  motivo_baja text,
  fecha_baja  timestamptz,
  created_at  timestamptz default now()
);
-- Un solo "Jóvenes". Incluye a los inactivos a propósito: si el ministerio
-- volvió, se reactiva, no se crea al lado (mismo criterio que el padrón, 0022).
create unique index ministerios_nombre_unico on ministerios (lower(nombre));

-- Líderes. Tabla y no columna porque un ministerio tiene VARIOS, y todos son
-- equivalentes: no hay "líder principal". Por eso tampoco hay una columna que
-- los ordene ni los distinga — cualquier jerarquía entre ellos vive fuera de
-- la app. Una persona puede liderar más de un ministerio (al revés que
-- discipulados, 0005).
-- Apunta a `profiles` y no a `miembros` porque es una cuestión de permisos:
-- lo que autoriza es la cuenta, no la ficha del padrón.
create table ministerio_lideres (
  ministerio_id uuid not null references ministerios(id) on delete cascade,
  profile_id    uuid not null references profiles(id)    on delete cascade,
  created_at    timestamptz default now(),
  primary key (ministerio_id, profile_id)
);

-- Roster. Espejo de `participaciones`: va contra el PADRÓN, no contra las
-- cuentas — hay gente que participa del ministerio y no tiene login.
create table ministerio_miembros (
  id            uuid primary key default gen_random_uuid(),
  ministerio_id uuid not null references ministerios(id) on delete cascade,
  miembro_id    uuid not null references miembros(id)    on delete cascade,
  activo        boolean not null default true,
  fecha_inicio  date default current_date,
  created_at    timestamptz default now(),
  unique (ministerio_id, miembro_id)
);
```

### `0025_reuniones_ministerio.sql` — reuniones, asistencia y ofrenda

```sql
create table reuniones_ministerio (
  id              uuid primary key default gen_random_uuid(),
  ministerio_id   uuid not null references ministerios(id) on delete cascade,
  fecha           date not null,
  tema            text,
  modalidad_usada modalidad,
  ofrenda_total   numeric(12,2) default 0,
  notas           text,
  registrado_por  uuid references profiles(id),
  created_at      timestamptz default now(),
  unique (ministerio_id, fecha)
);

create table asistencias_ministerio (
  id         uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references reuniones_ministerio(id) on delete cascade,
  miembro_id uuid not null references miembros(id) on delete cascade,
  presente   boolean not null default true,
  modalidad  modalidad,
  unique (reunion_id, miembro_id)
);
```

**Fuera a propósito**: `material_url`. El bucket `materiales` todavía no lo usa
ninguna pantalla, ni siquiera en discipulados; se suma cuando haga falta de
verdad.

### `0026_anuncios.sql` — el "mensaje" a los integrantes

Esto es la tabla `anuncios` que `PLAN-RED-IGLESIA.md` dejó en Fase 5, adelantada
con una columna de alcance. Sirve para las dos cosas de una vez.

```sql
create table anuncios (
  id            uuid primary key default gen_random_uuid(),
  ministerio_id uuid references ministerios(id) on delete cascade, -- null = toda la iglesia
  titulo        text not null,
  cuerpo        text not null,          -- admite marcas (lib/richText.ts)
  autor_id      uuid references profiles(id),
  fijado        boolean not null default false,
  vence_el      date,                   -- opcional: se cae solo del feed
  created_at    timestamptz default now()
);

-- Badge de no leídos sin tabla de lecturas: una marca de agua por cuenta.
-- El cliente la escribe solo (prof_update_self de 0002 ya lo permite; el
-- trigger no_autoescalar_rol solo mira `rol`), no hace falta RPC.
alter table profiles add column anuncios_leidos_hasta timestamptz;
```

## Autorización

Sigue el principio de siempre: **el poder viene de la asignación, no del rol**.
Estar en `ministerio_lideres` es lo que habilita, exactamente como
`discipulados.discipulador_id`. Un líder de ministerio **no necesita ser
`obrero`** — puede ser `miembro` y liderar.

### Varios líderes, todos iguales

`es_lider_de_ministerio()` es **pertenencia a un conjunto**, no una comparación
contra un único dueño. De ahí sale, sin lógica extra, que **todo lo que puede
hacer un líder lo pueden hacer todos**: registrar una reunión, **editar una que
cargó otro**, sumar o sacar integrantes, publicar anuncios, corregir la
descripción.

Es la diferencia de fondo con `discipulados`, donde `discipulador_id` es una
columna y el permiso es una igualdad (`= auth.uid()`). Ninguna de las funciones
de ministerio debe filtrar por "quien lo creó": si aparece un
`registrado_por = auth.uid()` en una condición de permiso, está mal.

Lo que sí se conserva es **quién hizo cada cosa**, como dato y no como candado:
`reuniones_ministerio.registrado_por` y `anuncios.autor_id` guardan al autor
original y **no se pisan cuando otro líder edita** — misma decisión que tomó
`0023` para las reuniones de discipulado.

> **Consecuencia práctica del `unique (ministerio_id, fecha)`**: si dos líderes
> cargan la misma fecha, el segundo no crea una reunión duplicada — el upsert
> del alta corrige la que ya estaba. Es el comportamiento deseado (una reunión
> por día), pero conviene que la pantalla avise que esa fecha ya tenía algo
> cargado en vez de pisarla en silencio.

### Helpers nuevos (mismo patrón `security definer` que `es_discipulador_de`)

```sql
es_lider_de_ministerio(p_ministerio uuid)   -- auth.uid() ∈ ministerio_lideres
participo_del_ministerio(p_ministerio uuid) -- auth.uid() → profiles.miembro_id
                                            --            → ministerio_miembros activo
```

### Matriz

La columna dice **cualquier líder** a propósito: no hay una columna para el que
lo creó y otra para los demás.

| Recurso | `miembro` | Participante | Cualquier líder | `admin` |
|---|:---:|:---:|:---:|:---:|
| Ver que el ministerio existe | ✓ | ✓ | ✓ | ✓ |
| Ver quiénes lo lideran | ✓ | ✓ | ✓ | ✓ |
| Ver el roster | ✗ | ✗ | ✓ | ✓ |
| Crear ministerio | ✗ | ✗ | ✗ | ✓ |
| Sumar/quitar líderes | ✗ | ✗ | ✗² | ✓ |
| Editar nombre y descripción | ✗ | ✗ | ✓ | ✓ |
| Sumar/quitar integrantes | ✗ | ✗ | ✓ | ✓ |
| Registrar reuniones + ofrenda | ✗ | ✗ | ✓ | ✓ |
| **Editar una reunión o anuncio de otro líder** | ✗ | ✗ | **✓** | ✓ |
| Ver el historial de reuniones | ✗ | ✓¹ | ✓ | ✓ |
| Publicar anuncios del ministerio | ✗ | ✗ | ✓ | ✓ |
| Leer anuncios del ministerio | ✗ | ✓ | ✓ | ✓ |
| Leer anuncios generales | ✓ | ✓ | ✓ | ✓ |

> ¹ Fecha, tema y presentes — **sin ofrenda ni notas**, igual que
> `reuniones_de_mi_grupo()` (`0019`). El corte va en el `returns table` del RPC,
> no en la UI.
> ² Único punto donde los líderes **no** son autosuficientes: quién lidera lo
> decide el admin, igual que en `discipulados`. Es la decisión abierta #6 de
> abajo; si se abre, es cambiar un `es_admin()` por un `or
> es_lider_de_ministerio()` en la policy de `ministerio_lideres`.

## RPCs

| RPC | Para qué | Espejo de |
|---|---|---|
| `registrar_reunion_ministerio(...)` | Alta y edición transaccional (reunión + asistencias + ofrenda). `p_reunion_id` null = alta con upsert por `(ministerio_id, fecha)`; con uuid = edición, validando contra el ministerio **guardado en la reunión**. | `registrar_reunion` (`0003`+`0023`) |
| `mis_ministerios()` | Los ministerios donde participo o lidero, con flag `soy_lider`. Un participante no puede leer `ministerio_miembros`, así que "cuáles son los míos" no se resuelve desde el cliente. | `mi_grupo()` (`0019`) |
| `reuniones_de_mi_ministerio(id)` | Historial visto por un participante: fecha, tema y presentes. Exige participación activa. | `reuniones_de_mi_grupo()` (`0019`) |
| `integrantes_de_mi_ministerio(id)` | Roster para el líder: `miembro_id`, nombre, apellido y teléfono **según `mostrar_contacto`**. **Incluye menores** (los necesita para pasar lista). Sin email ni notas. | el corte de `directorio` (`0014`+`0020`) |
| `candidatos_para_ministerio(id, texto)` | Buscar en el padrón a quién sumar, sin abrir la RLS de `miembros`. Similitud `pg_trgm`, teléfono enmascarado, excluye a los que ya están en el roster. | `candidatos_para_perfil` (`0018`) |
| `agregar_integrante_ministerio(...)` | Crear una ficha nueva del padrón **y** sumarla al roster, para el que todavía no existe. | `agregar_discipulo` (`0003`) |

> **Por qué los dos últimos son RPC y no un `insert` directo**: desde `0014` la
> RLS de `miembros` no deja leer el padrón salvo a admin o al discipulador de esa
> persona, y `miembros_insert` exige `es_admin() or es_obrero()`. Un líder de
> jóvenes que sea `miembro` no puede ni buscar ni crear. Y `directorio` **no
> sirve** como reemplazo: desde `0017` excluye a los menores de 18 — justo la
> población de adolescentes y jóvenes.
>
> Sumar a alguien que **ya está** en el padrón sí es un `insert` directo sobre
> `ministerio_miembros`: la policy del roster ya autoriza al líder.

## Superficie en la app

- **Tab "Mi grupo" → hub de pertenencia** (`app/(tabs)/discipulado.tsx`): pasa a
  mostrar "Mi discipulado" y "Mis ministerios". **No se agrega un sexto tab**: la
  barra ya tiene cinco.
- `app/ministerio/[id].tsx` — detalle: descripción, líderes, integrantes,
  historial y anuncios. Para el líder, los accesos de gestión. Una sola pantalla
  para tres audiencias (cualquier miembro / participante / líder), y el corte lo
  da `soy_lider`, no el rol.
- `app/ministerio/editar.tsx` — alta/edición. Admin crea, asigna líderes y da de
  baja; el líder edita nombre, ícono y descripción.
- `app/ministerio/integrantes.tsx` — gestión del roster: buscar en el padrón,
  crear la ficha de quien no está, dar de baja.
- `app/admin/ministerios.tsx` — ABM, espejo de `admin/discipulados.tsx`. Los
  dados de baja se reactivan desde la misma pantalla (a diferencia de
  discipulados, que tienen `admin/bajas.tsx`): son pocos.
- `app/reunion/nueva.tsx` y `app/reunion/[id].tsx` — **se comparten**, con un
  parámetro `origen` (`discipulado` | `ministerio`) que decide qué hook usar.
- `app/ofrendas.tsx` — mismo parámetro `origen`: dos entradas en Perfil, dos
  libros, un solo componente.
- `app/anuncios.tsx` (lista + compositor) + `components/AnunciosFeed.tsx` (la
  sección del feed de Inicio) + el badge de no leídos en la campana del `AppBar`.
  Abrir `app/anuncios.tsx` corre la marca de agua y apaga el badge.
- `lib/queries/ministerios.ts` y `lib/queries/anuncios.ts` — convención de
  siempre (`<entidad>Keys`, hooks de query y mutación, `invalidateQueries`
  explícito con `refetchType: "all"`).
- **`lib/auth.tsx` no alcanza para gatear la UI**: hoy todo se decide con
  `esObrero`, y un líder de ministerio puede ser `miembro`. Va un hook
  `useMisMinisterios()` (sobre `mis_ministerios()`), y las pantallas preguntan
  por ese resultado, no por el rol.

## Notificaciones push — fuera de alcance por ahora

**Decisión (2026-08-19): el aviso es in-app** (feed + badge). Funciona hoy en
Expo Go 54, sin dependencias nuevas.

El push real al celular con la app cerrada necesita: salir de Expo Go a un
development/preview build (el perfil `preview` de `eas.json` ya existe),
`expo-notifications`, una tabla de tokens por dispositivo y una Edge Function que
le pegue al servicio de Expo cuando entra un `anuncio`. Es una tanda propia, y el
modelo de datos de acá no cambia cuando se haga: se le cuelga encima.

## Fases

| Fase | Qué entra | Deja usable | Estado |
|---|---|---|---|
| **A** | `0024` + `lib/queries/ministerios.ts` + ABM admin + roster + detalle + hub en el tab | Los ministerios existen, tienen líder y gente | ✅ |
| **B** | `0025` + RPC + `origen` en el formulario de reunión y en ofrendas | El líder registra reuniones con asistencia y ofrenda | ✅ |
| **C** | `0026` + pantalla de anuncios + badge + sección en Inicio | El líder le avisa a su gente (y el admin, a toda la iglesia) | ✅ |
| **D** | *(opcional)* push con development build | El aviso llega con la app cerrada | ❌ fuera de alcance |

## Qué se construyó

Todo lo de las fases A-C, con estas **desviaciones respecto del diseño de arriba**
—todas por la misma razón: la RLS de `profiles` y de `miembros` esconde nombres
que la pantalla necesita mostrar—:

| Pieza | Por qué no estaba en el diseño |
|---|---|
| Vista **`ministerios_lideres`** (`0024`) | `ministerio_lideres` guarda `profile_id`, y `prof_select` (`0002`) solo deja leer el perfil propio: sin la vista, "ver quiénes lo lideran" mostraba uuids. Mismo patrón `security_invoker = false` que `directorio` (`0014`), exponiendo solo el nombre |
| RPC **`anuncios_visibles(incluir_vencidos)`** (`0026`) | Mismo problema con `anuncios.autor_id`: cada anuncio quedaba firmado con un uuid. Resuelve además el alcance y el vencimiento en una consulta. El **filtro de vencidos vive en el RPC y no en la policy** a propósito: quien gestiona necesita ver y borrar un anuncio ya caído |
| `integrantes_de_mi_ministerio` devuelve **`activo`** y también a los dados de baja | Las asistencias de una reunión vieja apuntan a gente que ya no está en el roster. Sin ellos, el historial y el formulario de edición mostrarían asistentes sin nombre. La UI filtra por `activo` para la lista de gestión y usa el conjunto completo para resolver nombres |
| `candidatos_para_ministerio` exige **2 caracteres** | Sin mínimo, la RPC era un volcado paginado del padrón completo para cualquier líder |
| Trigger **`trg_solo_admin_baja_ministerio`** | La RLS es por fila y no distingue columnas: sin el trigger, el `update` del líder sobre su ministerio le habría dejado tocar `activo` (mismo patrón que `solo_admin_da_de_baja`, `0022`) |
| Trigger **`trg_anuncios_conserva_autor`** | "El autor no se pisa cuando otro líder edita" pasa de ser una convención del cliente a una garantía de la base |
| `agregar_integrante_ministerio` **sin `email` ni `fecha_nacimiento`** | El líder no ve esas columnas en `integrantes_de_mi_ministerio`, así que tampoco las carga. Las completa después el admin, el discipulador de esa persona, o ella misma |
| Pantalla **`app/ministerio/integrantes.tsx`** | El diseño mencionaba el roster dentro del detalle. Buscar en el padrón + crear ficha + dar de baja es un formulario propio; el detalle muestra la lista y linkea acá |
| Aviso de **fecha ya ocupada** en el formulario de reunión | Es la "consecuencia práctica del `unique (ministerio_id, fecha)`" anotada arriba. Como el formulario se comparte, el aviso quedó para los dos orígenes: el `unique` de `reuniones` es el mismo |

**Cómo se gatea la UI**: `useMisMinisterios()` (sobre `mis_ministerios()`) y su
derivado `useSoyLiderDe(id)`. **Ninguna pantalla de ministerios pregunta por
`esObrero`** — un líder puede ser `miembro`. En Perfil, el bloque "Resumen
mensual" pasó a mostrarse con `esObrero || gestionaMinisterios`, y cada tarjeta
aparece según lo que la persona realmente administra.

## Decisiones diferidas

1. **Ministerios en el calendario.** Un ministerio no tiene horario propio: si se
   junta todas las semanas, eso es una `actividad`. Queda por definir si
   `actividades` suma un `ministerio_id` — que es exactamente el **diferido #5**
   de `ACTIVIDADES-Y-EVENTOS.md` (audiencia) y abre el **#8** (que el líder
   gestione las actividades de su ministerio).
2. **¿El participante ve el roster?** Hoy no: solo ve a los presentes de cada
   reunión, igual que en su discipulado. Si se abre, es una columna de
   visibilidad por ministerio, no un permiso global.
3. **Autoinscripción.** Hoy al roster lo maneja el líder o el admin. Que alguien
   pida sumarse desde la app es una feature aparte (necesita estado de solicitud
   y quién la aprueba).
4. **Ofrenda con destino.** `ofrenda_total` es un número suelto, como en
   discipulados. Si un ministerio necesita separar "para el campamento" de "para
   la obra", es una columna `destino` o una tabla de rubros — no un ministerio
   nuevo.
5. **Baja de un integrante.** `ministerio_miembros.activo` está previsto pero no
   hay UI para el motivo de la baja, a diferencia de `discipulados` (`0006`).
6. **¿Un líder puede sumar colíderes?** Hoy no: los líderes son iguales entre sí
   en todo lo operativo, pero quién entra a ese conjunto lo decide el admin. Es
   la única forma de que un líder no se convierta en administrador de hecho de
   su área, sumando cuentas sin que nadie más se entere. Si en la práctica pesa
   más la autonomía del ministerio que ese control, se abre la policy — pero
   entonces conviene que el alta de un colíder quede registrada (quién lo sumó
   y cuándo; `ministerio_lideres` ya tiene `created_at`, faltaría `agregado_por`).
