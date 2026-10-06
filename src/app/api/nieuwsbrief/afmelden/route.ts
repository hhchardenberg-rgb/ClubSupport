import { NextResponse } from "next/server";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { unsubscribeByToken } from "@/server/newsletter";

export const dynamic = "force-dynamic";

/**
 * Één-klik afmelden (RFC 8058, `List-Unsubscribe-Post`): mailprogramma's sturen een POST naar de link uit de mail.
 * Het token in de URL is de enige autorisatie (HMAC, niet te raden). Alleen POST muteert; GET doet niets.
 */
export async function POST(req: Request) {
  if (!(await rateLimit(`unsub:${clientIp(req)}`, 30, 3600))) return NextResponse.json({ ok: false }, { status: 429 });
  const token = new URL(req.url).searchParams.get("token");
  const ok = await unsubscribeByToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
