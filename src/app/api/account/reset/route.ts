import { NextResponse } from "next/server";
import { clientIp, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { setPasswordWithToken } from "@/server/activation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 403 });
  if (!(await rateLimit(`reset:${clientIp(req)}`, 10, 600))) return NextResponse.json({ error: "Te veel pogingen. Probeer het later opnieuw." }, { status: 429 });
  const body = await readJson(req);
  if (!body || typeof body.token !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  const r = await setPasswordWithToken(body.token, body.password, "reset");
  return r.ok ? NextResponse.json({ ok: true, area: r.area }) : NextResponse.json({ error: r.error }, { status: 400 });
}
