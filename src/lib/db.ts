import { Pool, type QueryResultRow } from "pg";

const globalForPool = globalThis as unknown as { __flyersPool?: Pool };

function getPool() {
  if (!globalForPool.__flyersPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL no está configurada");
    globalForPool.__flyersPool = new Pool({
      connectionString,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return globalForPool.__flyersPool;
}

/** Todas las consultas van contra el schema app_flyers con el rol flyers_app. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(text, params);
}
