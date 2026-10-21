@AGENTS.md

# app-flyers

Herramienta privada de un solo usuario (Axel) para generar flyers de CAEIA con IA. Next.js 16 + Supabase + Vercel Blob + Gemini. Contexto de marca y negocio: segundo cerebro (`WIKI/caeia-brief-marca.md`, `WIKI/caeia.md`).

## Regla no negociable: Supabase compartido con CAEIA
El proyecto de Supabase es **el mismo** que usa CAEIA, que tiene clientes reales. Esta app vive solo en el schema `app_flyers` con el rol `flyers_app`. No se leen, escriben ni referencian tablas de `public`, `auth`, `storage` ni ningún otro schema. Detalle y auditoría en la skill `supabase-aislamiento`. El hook `.claude/hooks/supabase-guard.mjs` bloquea las herramientas MCP de Supabase que se salgan de `app_flyers` (restore, branches, Edge Functions, SQL fuera del schema).

## Convenciones
- Variables de entorno en `.env.local` (ignorado por git). Nunca hardcodear keys. El repo es público: no subir nada sensible.
- Migraciones: `supabase/migrations/`, nombre `app_flyers_*`, con RLS y `grant` explícito para `flyers_app`.
- Costos: todo gasto de Gemini pasa por `assertWithinBudget` antes y `logUsage` después (`src/lib/budget.ts`).
- Modelos y precios de Gemini: solo en `src/lib/gemini/models.ts`. Los IDs se contrastan con la skill `gemini` de CAEIA o con la doc oficial antes de cambiarlos.

## Skills de este proyecto (`.claude/skills/`)
- `supabase-aislamiento`: reglas y auditoría del aislamiento con CAEIA. Propia de este repo.
- `supabase-postgres-best-practices`: reglas oficiales de Supabase (consultas, índices, conexiones, RLS).
- `security`: auth, secrets, uploads, headers, validación de entrada.
- `skill-security-auditor`: auditar cualquier skill de terceros **antes** de instalarla.

Las skills globales de gstack (`/review`, `/cso`, `/qa`, `/investigate`, `/careful`, `/guard`) ya están disponibles.
