import { NextResponse } from "next/server";
import { clientIp, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { apiStaff } from "@/lib/session";
import { scanToken } from "@/server/passes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * Scan: altijd een live databasecontrole. Geen caching. Antwoord bevat alleen het noodzakelijke:
 * uitkomst en (bij een bekende, niet-ingetrokken pas) naam + lidnummer. Onbekende codes zijn generiek.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const session = await apiStaff("scan");
  if (!session) return json({ error: "unauthorized" }, 401);
  // Extra limiet per IP tegen verspreide pogingen (token-enumeratie), naast de limiet per controleur.
  if (!(await rateLimit(`scan:ip:${clientIp(req)}`, 120, 60))) return json({ outcome: "rate_limited" }, 429);
  const body = await readJson(req, 512);
  const result = await scanToken(body?.code, session.user.id);
  return json(result, result.outcome === "rate_limited" ? 429 : 200);
}
