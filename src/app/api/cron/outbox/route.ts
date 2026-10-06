import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { processOutbox } from "@/server/email/outbox";
import { dispatchDueNewsletters, processNewsletters } from "@/server/newsletter";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

/** Herhaalpoging voor mails die eerder faalden (begrensde retries met backoff) en afronden van nieuwsbrieven in verzending. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const outbox = await processOutbox(50);
  const dispatched = await dispatchDueNewsletters();
  const newsletters = await processNewsletters(100);
  return NextResponse.json({ ok: true, ...outbox, dispatched, newsletters });
}
