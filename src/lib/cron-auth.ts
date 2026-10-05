import { safeEqual } from "./tokens";

/** Cron-endpoints: alleen met `Authorization: Bearer $CRON_SECRET` (Vercel Cron stuurt dit automatisch mee). */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // zonder sterk secret staat het endpoint dicht
  const got = req.headers.get("authorization") ?? "";
  return safeEqual(got, `Bearer ${secret}`);
}
