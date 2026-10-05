import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";
import { getPassForAccount } from "@/server/accounts";
import { revealToken } from "@/server/passes";
import { WalletNotConfigured } from "@/wallet/apple";
import { buildGoogleSaveUrl } from "@/wallet/google";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_: Request, ctx: { params: Promise<{ passId: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!(await rateLimit(`wallet:${s.user.id}`, 20, 600))) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  const { passId } = await ctx.params;
  const p = /^[0-9a-f-]{36}$/i.test(passId) ? await getPassForAccount(s.user.id, passId) : null;
  const token = p && p.status === "active" ? revealToken({ id: p.passId, tokenCiphertext: p.tokenCiphertext, status: p.status }) : null;
  if (!p || !token) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  try {
    const { url, objectId } = await buildGoogleSaveUrl({ passId: p.passId, name: p.fullName, memberNumber: p.memberNumber, token });
    await db.update(schema.pass).set({ googleObjectId: objectId }).where(eq(schema.pass.id, p.passId));
    await audit({ actor: s.user.id, action: "wallet.google.issue", targetType: "pass", targetId: p.passId });
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  } catch (e) {
    if (e instanceof WalletNotConfigured) return NextResponse.json({ error: "not_configured", message: "Google Wallet is nog niet ingericht door de beheerder." }, { status: 503, headers: NO_STORE });
    console.error("google wallet link mislukt", e instanceof Error ? e.message : "onbekend");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}
