"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { cancelNewsletter, createNewsletter, deleteNewsletterDraft, processNewsletters, queueNewsletter, retryFailedDeliveries, sendTestNewsletter, updateNewsletter } from "@/server/newsletter";
import { DomainError } from "@/server/passes";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function flow(back: string, fn: () => Promise<string>): Promise<never> {
  let q = "";
  try {
    q = `msg=${encodeURIComponent(await fn())}`;
  } catch (e) {
    if (!(e instanceof DomainError)) console.error("nieuwsbrief-actie mislukt", e instanceof Error ? e.message : "onbekend");
    q = `err=${encodeURIComponent(e instanceof DomainError ? e.message : "Er ging iets mis. Probeer het opnieuw.")}`;
  }
  revalidatePath("/beheer/nieuwsbrieven", "layout");
  redirect(`${back}?${q}`);
}

export async function saveNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  const input = { subject: str(f, "subject"), body: str(f, "body"), audience: str(f, "audience") };
  if (!id) {
    let newId = "";
    try {
      newId = await createNewsletter(s.user.id, input);
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      redirect(`/beheer/nieuwsbrieven/nieuw?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/beheer/nieuwsbrieven/${newId}?msg=${encodeURIComponent("Concept opgeslagen.")}`);
  }
  await flow(`/beheer/nieuwsbrieven/${id}`, async () => {
    await updateNewsletter(s.user.id, id, input);
    return "Concept opgeslagen.";
  });
}

export async function testNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  await flow(`/beheer/nieuwsbrieven/${id}`, async () => {
    const r = await sendTestNewsletter(s.user.id, id, s.user.email);
    return r.sent ? `${r.note} (naar ${s.user.email})` : r.note;
  });
}

export async function sendNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  await flow(`/beheer/nieuwsbrieven/${id}`, async () => {
    const r = await queueNewsletter(s.user.id, id, { confirm: f.get("confirm") === "on", expectedCount: Number(str(f, "expectedCount")) });
    await processNewsletters(25, id).catch(() => undefined); // eerste batch direct; de rest loopt door via de voortgangsbalk en de cron
    return `De nieuwsbrief is in de wachtrij gezet voor ${r.recipients} ontvanger(s).`;
  });
}

/** Aangeroepen door de voortgangsbalk: verwerkt één batch en meldt hoeveel er nog wachten. */
export async function processNewsletterAction(id: string): Promise<{ remaining: number; sent: number; failed: number; error?: string }> {
  await requireStaff("beheer", "newsletter.manage");
  try {
    return await processNewsletters(25, id);
  } catch {
    return { remaining: -1, sent: 0, failed: 0, error: "Verwerken mislukt" };
  }
}

export async function cancelNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  await flow(`/beheer/nieuwsbrieven/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig het annuleren met het vinkje.");
    await cancelNewsletter(s.user.id, id);
    return "Verzending geannuleerd. Wat al was verstuurd blijft verstuurd.";
  });
}

export async function retryNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  await flow(`/beheer/nieuwsbrieven/${id}`, async () => {
    const n = await retryFailedDeliveries(s.user.id, id);
    return n ? `${n} mislukte verzending(en) opnieuw in de wachtrij gezet.` : "Er zijn geen mislukte verzendingen.";
  });
}

export async function deleteNewsletterAction(f: FormData) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const id = str(f, "id");
  await flow(`/beheer/nieuwsbrieven`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig het verwijderen met het vinkje.");
    await deleteNewsletterDraft(s.user.id, id);
    return "Concept verwijderd.";
  });
}
