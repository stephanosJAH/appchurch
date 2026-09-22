# Supabase — setup

## Migraciones

Están en `supabase/migrations/` y **se aplican en orden numérico**. Cada una
asume que corrieron todas las anteriores: saltearse una no falla al aplicarla,
falla más tarde y en otro lado (ver "Verificar qué está aplicado" abajo).

| # | Archivo | Qué trae |
|---|---|---|
| 0001 | `0001_schema.sql` | enums + tablas |
| 0002 | `0002_rls.sql` | RLS: funciones auxiliares + policies |
| 0003 | `0003_rpc.sql` | RPCs (`registrar_reunion`, `agregar_discipulo`) + trigger de perfil |
| 0004 | `0004_storage.sql` | bucket `materiales` para documentos de lección |
| 0005 | `0005_discipulador_unico.sql` | regla 1:1 (un discipulador lidera un solo grupo) |
| 0006 | `0006_baja_logica_discipulado.sql` | baja lógica de grupos (`motivo_baja`, `fecha_baja`) |
| 0007 | `0007_eventos_adjunto.sql` | adjunto de eventos + bucket `adjuntos` |
| 0008 | `0008_discipulador_edita_su_grupo.sql` | el discipulador edita su propio grupo |
| 0009 | `0009_miembros_write_scoped.sql` | escritura de `miembros` acotada (seguridad #2) |
| 0010 | `0010_no_autoescalar_rol.sql` | bloquea auto-escalada de `rol` en `profiles` (seguridad #3) |
| 0011 | `0011_materiales_scope.sql` | escritura de `materiales` acotada al dueño + DELETE (seguridad #7) |
| 0012 | `0012_roles_expandidos.sql` | extiende la app a toda la congregación (`rol_app`: pendiente/miembro/obrero/admin) |
| 0013 | `0013_registro_aprobacion.sql` | registro con aprobación + `profiles.username`, `es_obrero()`, `es_miembro_activo()` |
| 0014 | `0014_directorio.sql` | vista `directorio` + cierre del padrón (RLS de `miembros`) |
| 0015 | `0015_actividades.sql` | tabla `actividades` (recurrentes semanales) |
| 0016 | `0016_mis_datos.sql` | autogestión de datos personales (`mis_datos`, `guardar_mis_datos`) |
| 0017 | `0017_directorio_solo_adultos.sql` | el directorio deja afuera a los menores de edad |
| 0018 | `0018_resolucion_identidad.sql` | `profiles.miembro_id` + `candidatos_para_perfil`, `resolver_identidad_pendiente` (pg_trgm) |
| 0019 | `0019_mi_grupo.sql` | el miembro ve SU grupo y su historial (`mi_grupo`, `reuniones_de_mi_grupo`) |
| 0020 | `0020_mostrar_contacto.sql` | `miembros.mostrar_contacto`: cada uno decide si publica su teléfono |
| 0021 | `0021_ficha_con_cuenta.sql` | `miembro_tiene_cuenta`, `guardar_notas_miembro` |
| 0022 | `0022_miembro_activo.sql` | **`miembros.activo`**: baja lógica del padrón + trigger solo-admin |
| 0023 | `0023_editar_reunion.sql` | editar una reunión ya registrada |
| 0024 | `0024_ministerios.sql` | ministerios: identidad, líderes y roster (Fase A) |
| 0025 | `0025_reuniones_ministerio.sql` | reuniones de ministerio con asistencia y ofrenda (Fase B) |
| 0026 | `0026_anuncios.sql` | anuncios de iglesia y de ministerio (Fase C) |
| 0027 | `0027_nombres_del_padron.sql` | el nombre que se muestra sale del padrón, no del registro |
| 0028 | `0028_candidatos_para_discipulado.sql` | sumar al grupo a alguien que YA está en el padrón |

Al agregar una migración nueva, sumale la fila acá y, si crea un objeto que
otras van a referenciar, sumalo también a la query de verificación de abajo.

## Cómo aplicarlas

**Opción A — SQL Editor (rápido):** abrí el SQL Editor del proyecto en supabase.com,
pegá y ejecutá cada archivo en orden.

**Opción B — Supabase CLI:**

```bash
supabase link --project-ref TU_REF
supabase db push
```

## Verificar qué está aplicado

No hay tabla de migraciones: se aplican a mano, así que la base no lleva
registro de cuáles corrieron. Peor, **saltearse una no da error en el momento**.
PL/pgSQL no valida las referencias a columnas al hacer `create function`, solo
la sintaxis: una RPC que lee una columna que todavía no existe se crea sin
quejarse y recién revienta en la primera llamada, desde la app y con un mensaje
que no menciona ninguna migración (ver BUG-03 en `docs/BUGS.md`).

Corré esto en el SQL Editor para ver qué falta:

```sql
with esperado(migracion, tipo, objeto) as (values
  ('0013','columna','profiles.username'),           ('0013','funcion','es_miembro_activo'),
  ('0014','vista',  'directorio'),                  ('0015','tabla',  'actividades'),
  ('0016','funcion','mis_datos'),                   ('0018','columna','profiles.miembro_id'),
  ('0018','funcion','resolver_identidad_pendiente'),('0019','funcion','mi_grupo'),
  ('0020','columna','miembros.mostrar_contacto'),   ('0021','funcion','miembro_tiene_cuenta'),
  ('0022','columna','miembros.activo'),             ('0022','funcion','solo_admin_da_de_baja'),
  ('0023','funcion','registrar_reunion'),           ('0024','tabla',  'ministerios'),
  ('0024','funcion','candidatos_para_ministerio'),  ('0025','tabla',  'reuniones_ministerio'),
  ('0026','tabla',  'anuncios'),                    ('0026','columna','profiles.anuncios_leidos_hasta'),
  ('0027','funcion','nombre_de_perfil'),            ('0028','funcion','candidatos_para_discipulado')
)
select migracion, tipo, objeto,
       case when case tipo
         when 'columna' then exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name   = split_part(objeto, '.', 1)
             and column_name  = split_part(objeto, '.', 2))
         when 'funcion' then exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = objeto)
         else to_regclass('public.' || objeto) is not null
       end then 'OK' else '*** FALTA ***' end as estado
from esperado
order by migracion, objeto;
```

Cada fila en `*** FALTA ***` es una migración para aplicar. Todas son
idempotentes (`add column if not exists`, `create or replace`, `drop ... if
exists`), así que se re-aplican sin romper nada. Aplicalas **en orden numérico**
entre ellas: varias recrean el mismo objeto y gana la última que corre.

## Crear el primer admin

El trigger `on_auth_user_created` crea un `profile` con rol `discipulador` por cada
usuario nuevo. Para tener un admin:

1. Registrá un usuario desde la app (o en Authentication > Users).
2. Promovelo en el SQL Editor:

```sql
update profiles set rol = 'admin' where id = (
  select id from auth.users where email = 'tu-email@ejemplo.com'
);
```

## Ingreso sin confirmación de email

La app crea la cuenta e inicia sesión al toque (nombre + email + password), sin
verificación por email. Para que funcione hay que desactivar la confirmación:

**Authentication → Sign In / Providers → Email → desactivar "Confirm email" → Save.**

Los usuarios que se hayan creado *antes* de apagar ese toggle quedan sin
confirmar y no pueden entrar. Confirmalos en el SQL Editor:

```sql
update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null;
```

## Credenciales de la app

Copiá `.env.example` a `.env` (en la raíz del proyecto) y completá:

```
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Las encontrás en Project Settings > API.
