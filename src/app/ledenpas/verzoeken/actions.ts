"use server";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { DomainError } from "@/server/passes";
import { createChangeRequest, withdrawChangeRequest } from "@/server/requests";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function flow(fn: () => Promise<string>): Promise<never> {
  let q: string;
  try {
    q = `msg=${encodeURIComponent(await fn())}`;
  } catch (e) {
    if (!(e instanceof DomainError)) console.error("verzoek mislukt", e instanceof Error ? e.message : "onbekend");
    q = `err=${encodeURIComponent(e instanceof DomainError ? e.message : "Er ging iets mis. Probeer het opnieuw.")}`;
  }
  redirect(`/ledenpas/verzoeken?${q}`);
}

export async function requestDetailsAction(f: FormData) {
  const s = await requireMember();
  await flow(async () => {
    await createChangeRequest(s.user.id, str(f, "memberId"), "details", { fullName: str(f, "fullName"), email: str(f, "email"), note: str(f, "note") });
    return "Je verzoek is verstuurd. De ledenadministratie beoordeelt het; je krijgt bericht per e-mail.";
  });
}

export async function requestCancellationAction(f: FormData) {
  const s = await requireMember();
  await flow(async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig je opzegverzoek met het vinkje.");
    await createChangeRequest(s.user.id, str(f, "memberId"), "cancellation", { endDate: str(f, "endDate"), note: str(f, "note") });
    return "Je opzegverzoek is verstuurd. Het lidmaatschap loopt door tot de ledenadministratie het heeft verwerkt.";
  });
}

export async function withdrawRequestAction(f: FormData) {
  const s = await requireMember();
  await flow(async () => {
    await withdrawChangeRequest(s.user.id, str(f, "id"));
    return "Verzoek ingetrokken.";
  });
}
