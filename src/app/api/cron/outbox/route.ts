import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { processOutbox } from "@/server/email/outbox";

export const dynamic = "force-dynamic";

/** Herhaalpoging voor mails die eerder faalden (begrensde retries met backoff). */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await processOutbox(50)) });
}
