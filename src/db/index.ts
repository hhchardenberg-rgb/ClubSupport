import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pool?: Pool };

function pool(): Pool {
  if (!globalForDb.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL ontbreekt (zie .env.example)");
    globalForDb.__pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
    });
  }
  return globalForDb.__pool;
}

let _db: ReturnType<typeof create> | undefined;
function create() {
  return drizzle(pool(), { schema });
}

/** Lazy, zodat `next build` niet faalt zonder DATABASE_URL. */
export const db = new Proxy({} as ReturnType<typeof create>, {
  get(_t, prop) {
    _db ??= create();
    return Reflect.get(_db, prop);
  },
});

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
