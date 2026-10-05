import { NextResponse } from "next/server";
import { clientIp, readJson, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { processOutbox, requestPasswordReset } from "@/server/email/outbox";

export const dynamic = "force-dynamic";

/** Altijd dezelfde generieke bevestiging: verklapt niet of het adres bij een account hoort. */
const GENERIC = { ok: true, message: "Als dit e-mailadres bij een account hoort, sturen we een link om je wachtwoord opnieuw in te stellen." };

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 403 });
  const body = await readJson(req);
  const email = typeof body?.email === "string" ? body.email.slice(0, 254) : "";
  const ip = clientIp(req);
  const okIp = await rateLimit(`reset-ip:${ip}`, 10, 900);
  const okEmail = email ? await rateLimit(`reset-email:${email.trim().toLowerCase()}`, 3, 3600) : false;
  if (okIp && okEmail) {
    await requestPasswordReset(email);
    await processOutbox(5).catch(() => undefined);
  }
  return NextResponse.json(GENERIC); // ook bij rate limit: zelfde antwoord, geen enumeratie
}
