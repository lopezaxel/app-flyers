// Guard de aislamiento: el proyecto de Supabase es compartido con CAEIA (clientes reales).
// Se ejecuta antes de cada herramienta MCP de Supabase y bloquea lo que podría afectar a CAEIA.
// Límite conocido: detecta referencias calificadas (public.tabla) y exige que el SQL nombre
// app_flyers; no puede detectar una tabla de CAEIA escrita sin schema junto a app_flyers.
import { stdin, stdout } from "node:process";

const PROTECTED = [
  "public", "auth", "storage", "vault", "realtime", "cron", "net",
  "extensions", "graphql", "graphql_public", "supabase_migrations", "tevez", "pgsodium",
];

const ALWAYS_BLOCKED = {
  restore_project: "restaurar el proyecto revertiría los datos de clientes de CAEIA",
  pause_project: "pausar el proyecto apaga CAEIA",
  create_project: "no se crean proyectos desde app-flyers",
  create_branch: "los branches del proyecto compartido pueden terminar en un merge sobre CAEIA",
  delete_branch: "los branches pertenecen al proyecto compartido",
  merge_branch: "un merge aplicaría migraciones sobre el proyecto de CAEIA",
  rebase_branch: "los branches pertenecen al proyecto compartido",
  reset_branch: "un reset de branch puede borrar datos del proyecto compartido",
  deploy_edge_function: "desplegar podría pisar una Edge Function de CAEIA",
  create_edge_function_secret: "los secrets de las Edge Functions son de CAEIA",
};

function deny(reason) {
  stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Aislamiento Supabase (app-flyers ↔ CAEIA): ${reason}. Si de verdad hace falta, que lo haga Axel a mano o lo autorice explícitamente.`,
      },
    }),
  );
  process.exit(0);
}

function clean(sql) {
  return String(sql ?? "").replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
}

const protectedRef = new RegExp(`(?<![\\w"])"?(${PROTECTED.join("|")})"?\\s*\\.\\s*"?[a-z_]`);
const protectedSchema = new RegExp(`\\bschema\\s+(if\\s+(not\\s+)?exists\\s+)?"?(${PROTECTED.join("|")})"?\\b`);

function checkSql(sql, { requireOwnSchema }) {
  const q = clean(sql);
  if (protectedRef.test(q) || protectedSchema.test(q)) {
    deny("el SQL referencia un schema que no es app_flyers (public/auth/storage/…)");
  }
  if (/\b(create|alter|drop)\s+(role|user)\b/.test(q) && !q.includes("flyers_app")) {
    deny("no se crean, modifican ni borran roles que no sean flyers_app");
  }
  const mentionsOwn = q.includes("app_flyers") || q.includes("flyers_app");
  const onlyCatalog = /\b(pg_[a-z_]+|information_schema)\b/.test(q);
  if (requireOwnSchema ? !mentionsOwn : !(mentionsOwn || onlyCatalog)) {
    deny("el SQL no nombra el schema app_flyers (ni es una consulta de catálogo pg_*/information_schema)");
  }
}

let raw = "";
for await (const chunk of stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // payload ilegible: no se puede juzgar, se deja pasar
}

const action = String(input.tool_name ?? "").split("__").pop();
const args = input.tool_input ?? {};

if (action in ALWAYS_BLOCKED) deny(ALWAYS_BLOCKED[action]);

if (action === "execute_sql") checkSql(args.query, { requireOwnSchema: false });

if (action === "apply_migration") {
  if (!String(args.name ?? "").startsWith("app_flyers_")) {
    deny("el nombre de la migración debe empezar con app_flyers_");
  }
  checkSql(args.query, { requireOwnSchema: true });
}

process.exit(0);
