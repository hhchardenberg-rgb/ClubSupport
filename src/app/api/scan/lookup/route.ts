import { NextResponse } from "next/server";
import { clientIp, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { apiStaff } from "@/lib/session";
import { lookupMembers } from "@/server/passes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** Beperkt zoeken op naam of lidnummer voor de controleur. Zie lookupMembers() voor de begrenzingen. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const session = await apiStaff("members.lookup");
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!(await rateLimit(`lookup:ip:${clientIp(req)}`, 60, 60))) return json({ ok: false, reason: "rate_limited" }, 429);
  const body = await readJson(req, 512);
  const r = await lookupMembers(body?.q, session.user.id);
  return json(r, r.ok ? 200 : r.reason === "rate_limited" ? 429 : 400);
}
