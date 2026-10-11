# Reunión de obreros

La reunión del cuerpo de obreros: **quiénes participaron** y un **acta de lo
tratado**. Los temas son los ministerios y sus actividades, la organización de
limpiezas y el trabajo general de la iglesia.

Migración: [`0031_reuniones_obreros.sql`](../supabase/migrations/0031_reuniones_obreros.sql).
Pantalla: `app/admin/reuniones-obreros.tsx`, desde **Perfil → Administración →
Reunión de obreros**.

## Por qué es una entidad propia

La pregunta de la que salió esta feature fue *"¿esto debería colgar de un
ministerio?"*. La respuesta es **no**, y las tres alternativas se descartaron a
propósito:

| Alternativa | Por qué no |
|---|---|
| Un **ministerio** "Obreros" | Un ministerio es un **área** de la iglesia (jóvenes, alabanza, acción social), no el cuerpo que la dirige. Esa fila falsa arrastraría `ministerio_lideres`, `ministerio_miembros`, `mis_ministerios()` y todas las pantallas de ministerio, mintiendo en cada una. |
| `reuniones` o `reuniones_ministerio` | Las dos **exigen un grupo dueño**: `discipulado_id` y `ministerio_id` son `not null`, con `unique (dueño, fecha)`. No hay dónde ponerla sin inventar el dueño. |
| Una **actividad** con ocurrencias | `actividades` modela recurrencia **semanal** (`dias_semana`) y es **pública** — sale en el feed y el calendario de todos. El acta de obreros no es agenda pública. Además habría que construir el *attendance-per-occurrence* genérico (diferido de [`ACTIVIDADES-Y-EVENTOS.md`](./ACTIVIDADES-Y-EVENTOS.md)) para atender un solo caso. |

**No es un tercer libro contable.** Lo que justificó separar físicamente los
libros de discipulado y ministerio (decisión del 2026-08-19, ver `0025`) fue la
**contabilidad**. Acá no hay plata: la tabla no copia `ofrenda_total` ni
`modalidad_usada`, y la reunión de obreros **no aparece** en
`app/ofrendas.tsx` ni en `app/admin/ofrendas.tsx`.

**Espejo parcial.** Lo único que sí se repite de `registrar_reunion` (`0003` +
`0023`) y `registrar_reunion_ministerio` (`0025`) es la **mecánica de
asistencias**: inserción aditiva en el alta, "el payload manda" en la edición.
Una corrección a esa mecánica en cualquiera de los tres va en los tres. El
resto del cuerpo **no** es espejo y no debe sincronizarse.

## Por qué la UI no reusa `reunion/nueva.tsx`

`app/reunion/nueva.tsx` se comparte entre discipulado y ministerio porque son
**los mismos campos** con dos hooks distintos, y ya tiene **29 ramas
`esMinisterio`**. Acá los campos son otros: el acta es el campo principal, no
hay ofrenda y no hay modalidad por persona. Un tercer `origen` convertiría "un
formulario con dos variantes" en "tres formularios en un archivo". El checklist
de asistencia se duplica (es más simple que el original, sin modalidad por
persona) y sale más barato que generalizar una pantalla que funciona.

## Autorización: admin, y nada más

**Es el único recurso de gestión cerrado a `obrero`.** La razón es que abrirlo
obliga a contestar antes *quiénes son el cuerpo de obreros*, y ese conjunto hoy
**no está modelado**:

- El rol `obrero` significa "líder que gestiona **sus** grupos". No es
  necesariamente la misma gente que se sienta en la reunión: un **líder de
  ministerio puede ser `miembro`** (ver [`MINISTERIOS.md`](./MINISTERIOS.md)).
- Subir a esa persona a `obrero` para que entre a la reunión le daría **de
  rebote** el poder de activar cuentas pendientes (`0013`, `0018`) y crear
  fichas del padrón (`0014`). Ese es el costo de usar el rol como si fuera el
  cuerpo.

Mientras la pregunta esté abierta, el acta la carga el admin. **El día que se
cierre, lo único que cambia es la policy de `select`**: se reemplaza
`es_admin()` por un helper de pertenencia, sin tocar datos ni el RPC.

### Borrar no existe, y acá está garantizado por construcción

Las dos tablas tienen **sólo policy de `select`**. Sin policy de
insert/update/delete, el RPC definer `registrar_reunion_obreros` es el **único
camino de escritura**: no hay `DELETE` por REST ni forma de pisar
`registrado_por`.

Cuando se escribió `0031`, esto era deliberadamente distinto de `reu_all`
(`0002_rls.sql:45`) y `reumin_all` (`0025`), que eran `for all`. **`0032` alineó
los otros dos libros a este criterio**: las cuatro tablas de reuniones son hoy
sólo de lectura por RLS.

### Auditoría

`registrado_por` guarda quién la cargó y **no se pisa** (ni al editar, ni cuando
un alta sobre una fecha existente entra por el `on conflict`). `editado_por` /
`editado_en` guardan la última corrección, porque el acta es un texto largo que
varios admins pueden retocar. **Ninguna de las tres es parte de un chequeo de
permiso.**

## Decisiones de datos

- **Una reunión por fecha** (`unique (fecha)`). El alta sobre una fecha ocupada
  **actualiza** en vez de duplicar, y la UI avisa antes de guardar — mismo
  comportamiento que `reunion/nueva.tsx`.
- **La asistencia va contra `miembros`** (el padrón), no contra `profiles`. Dos
  razones: un obrero que **no usa la app** igual se sienta en la reunión y tiene
  que poder marcarse presente, y así `lib/asistencia.ts` y la grilla del roster
  sirven sin adaptar nada.
- **Destildar ≠ quitar.** Destildar deja a la persona registrada como
  **ausente** (`presente = false`); la cruz la **saca** de la reunión. La
  distinción importa porque permite llevar una lista estable de obreros y
  marcar faltas.
- **El acta usa las marcas de `lib/richText.ts`**, las mismas de las
  descripciones (`0029`/`0030`). No es markdown completo y no necesita
  dependencias nuevas. Si queda vacía, `estaVacio()` la guarda como `null`.
- **Sin `modalidad`.** Si algún día la reunión se hace virtual se suma la
  columna; es barato. No se copió "porque los otros la tienen".

## Diferidos y preguntas abiertas

1. **¿Quiénes son el cuerpo de obreros?** La decisión que desbloquea abrir la
   lectura del acta más allá del admin. Opciones evaluadas: exactamente el rol
   `obrero`; `obrero` + líderes de ministerio; una lista explícita administrada
   por el admin. Las tres se implementan cambiando **un solo helper**.
2. ~~**`reu_all` y `reumin_all` son `for all`.**~~ **Resuelto en
   [`0032_reuniones_solo_lectura.sql`](../supabase/migrations/0032_reuniones_solo_lectura.sql)**:
   las cuatro policies pasaron a `for select`, con los mismos `using`. La
   escritura de los dos libros queda sólo en manos de `registrar_reunion` y
   `registrar_reunion_ministerio` (ambos definer), así que el **"Borrar no
   existe"** de [`ROLES-Y-PERMISOS.md`](./ROLES-Y-PERMISOS.md) y `SDD.md` §4.4
   ahora lo garantiza la base y no la UI.
3. **La reunión general del domingo** (el culto) quedó **fuera de alcance**. No
   es la misma cosa que esta: la asistencia es un **conteo agregado**, no una
   lista nominal, no tiene acta, y **sí tiene ofrenda** — la entrada más grande
   de la iglesia. Si esa plata entra a la app, necesita tesorería asignada por
   tabla (el rol no alcanza), correcciones con rastro en vez de pisar el valor,
   y el diferido #2 cerrado antes. Juntarla con el acta de obreros habría hecho
   que heredara los permisos de un acta.
4. **Historial de versiones del acta.** No existe. Si estas actas tienen valor
   formal (libro de actas de la asociación civil), la app **no es el lugar**: no
   guarda versiones ni tiene firma.
5. **Turnos de limpieza como funcionalidad propia.** Que un acta "organice
   limpiezas" no la convierte en un cronograma. Si hace falta un calendario de
   turnos, es otra feature.
6. **Temas pastorales delicados** sobre una persona puntual no deberían ir a un
   acta compartida. Ese contenido ya tiene su lugar: las **notas de la ficha**
   del miembro, que son privadas. La ayuda del editor lo dice en la pantalla.
