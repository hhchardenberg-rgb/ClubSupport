import { Resend } from "resend";
import { env } from "@/lib/env";
import type { Mail } from "./templates";

export type SendResult = { ok: true; ref: string } | { ok: false; error: string; permanent: boolean } | { ok: "suppressed" };

/**
 * Verzendt via Resend. Testmodus: alle mails gaan naar EMAIL_TEST_RECIPIENT met [TEST]-prefix
 * (er wordt nooit naar echte leden verstuurd). Modus 'disabled': niets verzenden.
 */
export async function sendMail(to: string, mail: Mail, idempotencyKey: string): Promise<SendResult> {
  const mode = env.emailMode;
  if (mode === "disabled") return { ok: "suppressed" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "E-mailprovider niet geconfigureerd", permanent: false };

  let recipient = to;
  let subject = mail.subject;
  if (mode === "test") {
    const testTo = process.env.EMAIL_TEST_RECIPIENT;
    if (!testTo) return { ok: false, error: "EMAIL_TEST_RECIPIENT ontbreekt (testmodus)", permanent: false };
    recipient = testTo;
    subject = `[TEST] ${subject}`;
  }
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send(
      { from: process.env.EMAIL_FROM ?? "HHC ClubSupport <onboarding@resend.dev>", to: recipient, subject, text: mail.text, html: mail.html, ...(mail.headers ? { headers: mail.headers } : {}) },
      { idempotencyKey },
    );
    if (error) return { ok: false, error: `${error.name}`.slice(0, 120), permanent: /validation|invalid/i.test(error.name) };
    return { ok: true, ref: data?.id ?? "" };
  } catch {
    return { ok: false, error: "Verzending mislukt", permanent: false };
  }
}
