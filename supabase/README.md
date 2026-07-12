# Supabase — setup

Migraciones en orden (`supabase/migrations/`):

1. `0001_schema.sql` — enums + tablas
2. `0002_rls.sql` — RLS: funciones auxiliares + policies
3. `0003_rpc.sql` — RPCs (`registrar_reunion`, `agregar_discipulo`) + trigger de perfil
4. `0004_storage.sql` — bucket `materiales` para documentos de lección
5. `0005_discipulador_unico.sql` — regla 1:1 (un discipulador lidera un solo grupo)
6. `0006_baja_logica_discipulado.sql` — baja lógica (motivo_baja, fecha_baja)
7. `0007_eventos_adjunto.sql` — adjunto de eventos + bucket `adjuntos`
8. `0008_discipulador_edita_su_grupo.sql` — el discipulador edita su propio grupo
9. `0009_miembros_write_scoped.sql` — escritura de `miembros` acotada (seguridad #2)
10. `0010_no_autoescalar_rol.sql` — bloquea auto-escalada de `rol` en `profiles` (seguridad #3)
11. `0011_materiales_scope.sql` — escritura de `materiales` acotada al dueño + DELETE (seguridad #7)

## Cómo aplicarlas

**Opción A — SQL Editor (rápido):** abrí el SQL Editor del proyecto en supabase.com,
pegá y ejecutá cada archivo en orden.

**Opción B — Supabase CLI:**

```bash
supabase link --project-ref TU_REF
supabase db push
```

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
