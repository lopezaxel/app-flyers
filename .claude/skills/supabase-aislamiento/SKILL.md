---
name: supabase-aislamiento
description: Reglas obligatorias cuando app-flyers toca Supabase. El proyecto de Supabase es el mismo que usa CAEIA (clientes reales); app-flyers vive solo en el schema app_flyers con el rol flyers_app. Usar antes de cualquier migración, consulta SQL, cambio de permisos, Edge Function, backup/restore, o cuando aparezca DATABASE_URL o una key de Supabase.
argument-hint: "[migracion | permisos | auditoria | restore]"
---

# Supabase compartido con CAEIA: aislamiento

## Contexto
- Hay **un solo proyecto Supabase** (plan Pro) y lo comparten CAEIA (próxima a lanzarse, con clientes reales) y esta app.
- app-flyers vive solo en el schema `app_flyers`, con el rol `flyers_app`: sin superuser, sin `bypassrls`, sin `CREATE` en ningún schema.
- Verificado el 2026-10-20: `flyers_app` no tiene permisos sobre ninguna tabla ni función de `public`, `auth` ni `storage`. Su `USAGE` sobre `public` y `net` viene del default de Supabase (PUBLIC), no de una concesión nuestra.

## Reglas
1. **Solo `app_flyers`.** Nunca leer, escribir ni referenciar `public`, `auth`, `storage`, `vault`, `realtime`, `cron`, `net` ni `tevez`. Si una feature parece necesitarlo, parar y preguntarle a Axel.
2. **Conexión de la app:** solo `DATABASE_URL` del rol `flyers_app` por el pooler. Nunca `postgres`, `service_role` ni la anon key dentro de app-flyers.
3. **Migraciones:** nombre `app_flyers_<algo>`; solo DDL dentro de `app_flyers`; cada tabla nueva con RLS, una policy para `flyers_app` y `grant` explícito (copiar el patrón de `0001`/`0002`). Guardar el `.sql` en `supabase/migrations/` de este repo.
4. **Nunca desde esta carpeta:** restaurar o pausar el proyecto, crear/mergear/resetear branches, desplegar Edge Functions, cargar secrets. Un restore o PITR hecho "por flyers" revertiría los datos de clientes de CAEIA. El hook `.claude/hooks/supabase-guard.mjs` bloquea esas herramientas.
5. **Ni para "mirar"** se consultan tablas de CAEIA. Sí se pueden consultar catálogos (`pg_*`, `information_schema`) para auditar permisos.
6. **Antes de tocar permisos o roles,** correr la auditoría de abajo y comparar con el resultado esperado.
7. **Rollback propio** (solo con confirmación explícita de Axel): `drop schema app_flyers cascade; drop role flyers_app;`.

## Del lado de CAEIA (recordatorio para sus sesiones)
- El repo de CAEIA no conoce las migraciones `20261020211252_app_flyers_schema` y `20261020212127_app_flyers_login_attempts`. Un `supabase db push` o `db pull` desde allá va a avisar de versiones remotas desconocidas, y un `db reset --linked` **borraría `app_flyers`**. Conviene copiar esas dos migraciones al `supabase/migrations/` de CAEIA con las mismas versiones, o no correr reset contra el proyecto remoto.
- CAEIA nunca debe leer ni escribir `app_flyers`.

## Auditoría de aislamiento (solo lectura)
Debe dar **cero filas** en `public`, `auth`, `storage`, `vault`:

```sql
select n.nspname as schema, c.relname as objeto,
       has_table_privilege('flyers_app', c.oid, 'SELECT') as puede_leer,
       has_table_privilege('flyers_app', c.oid, 'INSERT,UPDATE,DELETE') as puede_escribir
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','v','m','p','f')
  and n.nspname not in ('pg_catalog','information_schema','app_flyers')
  and (has_table_privilege('flyers_app', c.oid, 'SELECT')
       or has_table_privilege('flyers_app', c.oid, 'INSERT,UPDATE,DELETE'));
```

Resultado esperado hoy: solo objetos de `cron` y `net` (extensiones de Supabase, heredados de PUBLIC). Cualquier fila en `public` es una fuga: revocar y avisar.

## Si algo se rompió
- La app da `permission denied for table`: falta un `grant` en la migración nueva.
- La app da `permission denied for schema`: alguien tocó los `grant usage` de `app_flyers`.
- Aparecen tablas de CAEIA en una query de esta app: parar, no seguir, avisar a Axel.
