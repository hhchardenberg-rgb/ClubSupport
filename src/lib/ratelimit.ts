import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Vaste-venster rate limiter in Postgres (werkt op serverless, atomisch via upsert).
 * Geeft true terug als het verzoek is toegestaan.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await db.execute(sql`
    insert into app_rate_limit (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when app_rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else app_rate_limit.count + 1 end,
      window_start = case when app_rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else app_rate_limit.window_start end
    returning count`);
  const count = Number((res.rows[0] as { count: number }).count);
  return count <= limit;
}
