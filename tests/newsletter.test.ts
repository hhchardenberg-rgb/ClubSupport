import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";
import { amsterdamToday, CATEGORY_LABEL, memberCategory } from "@/lib/membership";
import { can } from "@/lib/permissions";
import { formatAmsterdamLocal } from "@/lib/time";

type Sent = { to: string; subject: string; html: string; text: string; headers?: Record<string, string>; key: string };
const sent: Sent[] = [];
let failWith: null | { permanent: boolean } = null;
vi.mock("@/server/email/provider", () => ({
  sendMail: async (to: string, mail: Sent, key: string) => {
    if (failWith) return { ok: false, error: "fout", permanent: failWith.permanent };
    sent.push({ ...mail, to, key });
    return { ok: true, ref: "r" };
  },
}));

beforeEach(async () => {
  await reset();
  sent.length = 0;
  failWith = null;
  process.env.EMAIL_MODE = "live";
});

const day = (offset: number) => {
  const d = new Date(`${amsterdamToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function members() {
  const acc = await import("@/server/accounts");
  const ms = await import("@/server/memberships");
  const admin = await makeUser("adm", "manager");
  const mk = (n: string, email: string | null, membership?: { startDate?: string; endDate?: string; status?: "active" | "suspended" }) =>
    acc.createMemberWithPass(admin, { memberNumber: n, fullName: `Lid ${n}`, email, membership, confirmLinkExisting: true });
  const valid = await mk("N1", "geldig@example.test");
  const fam1 = await mk("N2", "gezin@example.test");
  const fam2 = await mk("N3", "Gezin@Example.test"); // zelfde adres, ander hoofdlettergebruik
  const scheduled = await mk("N4", "later@example.test", { startDate: day(3) });
  const suspended = await mk("N5", "geschorst@example.test", { status: "suspended" });
  const expired = await mk("N6", "verlopen@example.test", { endDate: day(-2) });
  const ended = await mk("N7", "beeindigd@example.test");
  await ms.changeMembership(admin, ended.memberId, "end", { reason: "opgezegd" });
  const archValid = await mk("N8", "archief-geldig@example.test");
  await ms.archiveMember(archValid.memberId, admin, "opgeruimd");
  const archEnded = await mk("N9", "archief-oud@example.test");
  await ms.changeMembership(admin, archEnded.memberId, "end", { reason: "opgezegd" });
  await ms.archiveMember(archEnded.memberId, admin, "opgeruimd");
  await mk("N10", null); // geen e-mailadres
  const gone = await mk("N11", "weg@example.test");
  const { deleteMember } = await import("@/server/passes");
  await deleteMember(gone.memberId, admin, "verwijderd");
  void valid; void fam1; void fam2; void scheduled; void suspended; void expired;
  return { admin };
}

describe("oud-leden", () => {
  it("categorie volgt het lidmaatschap: beëindigd of verlopen = oud-lid", () => {
    expect(memberCategory("ended")).toBe("oud-lid");
    expect(memberCategory("expired")).toBe("oud-lid");
    expect(memberCategory("valid")).toBe("lid");
    expect(memberCategory("suspended")).toBe("lid");
    expect(memberCategory("scheduled")).toBe("lid");
    expect(memberCategory("none")).toBe("geen");
    expect(CATEGORY_LABEL["oud-lid"]).toBe("Oud-lid");
  });

  it("filter 'oud-leden' in de ledenlijst en teller op het dashboard; een nieuw lidmaatschap maakt weer lid", async () => {
    const { admin } = await members();
    const { listMembers, dashboardCounts } = await import("@/server/admin");
    const { changeMembership } = await import("@/server/memberships");
    const former = await listMembers({ membership: "former" });
    expect(former.rows.map((r) => r.memberNumber).sort()).toEqual(["N6", "N7"]); // verlopen + beëindigd (gearchiveerde staan niet in de standaardlijst)
    const formerArch = await listMembers({ membership: "former", status: "gearchiveerd" });
    expect(formerArch.rows.map((r) => r.memberNumber)).toEqual(["N9"]);
    const c = await dashboardCounts();
    expect(Number(c.former_ended) + Number(c.former_expired)).toBe(3); // N6 (verlopen), N7 en N9 (beëindigd)
    const n7 = former.rows.find((r) => r.memberNumber === "N7")!;
    await changeMembership(admin, n7.id, "activate", { reason: "heraanmelding" });
    expect((await listMembers({ membership: "former" })).rows.map((r) => r.memberNumber)).toEqual(["N6"]);
  });
});

describe("nieuwsbrief: opmaak", () => {
  it("escapet HTML, linkt alleen http(s), ondersteunt kop/opsomming/vet en voegt afmelding toe", async () => {
    const { newsletterMail, validateNewsletter } = await import("@/server/email/newsletter-render");
    const m = newsletterMail({
      subject: "Nieuws",
      body: "## Kop\n\nHallo <script>alert(1)</script> **vet** https://hhc.example/nieuws, en [klik](https://hhc.example/a?x=1&y=2) en [fout](javascript:alert(1)) en <img src=x onerror=alert(1)>\n\n- een\n- twee",
      token: "tok",
      audienceNote: "Je ontvangt dit omdat je lid bent.",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("<strong>vet</strong>");
    expect(m.html).toContain('<h2 style="font-size:17px;margin:20px 0 6px">Kop</h2>');
    expect(m.html).toContain("<li");
    expect(m.html).toContain('href="https://hhc.example/nieuws"');
    expect(m.html).toContain('href="https://hhc.example/a?x=1&amp;y=2"');
    expect(m.html).not.toContain('href="javascript:');
    expect(m.html).toContain("/afmelden/tok");
    expect(m.text).toContain("Afmelden voor nieuwsbrieven");
    expect(m.headers?.["List-Unsubscribe"]).toMatch(/api\/nieuwsbrief\/afmelden\?token=tok/);
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(newsletterMail({ subject: "a", body: "b", token: "t", audienceNote: "n", preview: true }).headers).toBeUndefined();
    expect(validateNewsletter("Regel1\nRegel2", "x")).toMatch(/regeleinden/);
    expect(validateNewsletter("", "x")).toMatch(/onderwerp/);
    expect(validateNewsletter("a", " ")).toMatch(/tekst/);
    expect(validateNewsletter("a".repeat(151), "x")).toMatch(/te lang/);
  });
});

describe("nieuwsbrief: doelgroepen", () => {
  it("leden / oud-leden / iedereen: juiste adressen, gedeeld adres één keer, verwijderde en adresloze leden nooit, afgemelden uitgesloten", async () => {
    await members();
    const { audienceRecipients } = await import("@/server/newsletter");
    expect((await audienceRecipients("members")).emails).toEqual(["geldig@example.test", "gezin@example.test"]);
    expect((await audienceRecipients("former")).emails).toEqual(["archief-oud@example.test", "beeindigd@example.test", "verlopen@example.test"]);
    const all = (await audienceRecipients("everyone")).emails;
    expect(all).toEqual(["archief-geldig@example.test", "archief-oud@example.test", "beeindigd@example.test", "geldig@example.test", "geschorst@example.test", "gezin@example.test", "later@example.test", "verlopen@example.test"]);
    expect(all).not.toContain("weg@example.test");
    const { db, schema } = await import("@/db");
    await db.insert(schema.newsletterOptout).values({ email: "geldig@example.test" });
    const r = await audienceRecipients("members");
    expect(r.emails).toEqual(["gezin@example.test"]);
    expect(r.optedOut).toBe(1);
  });
});

describe("nieuwsbrief: verzenden", () => {
  async function draft(audience = "members") {
    const { admin } = await members();
    const nl = await import("@/server/newsletter");
    const id = await nl.createNewsletter(admin, { subject: "Maandbrief", body: "Hallo **leden**", audience });
    return { nl, id, admin };
  }

  it("bevestiging en kloppend ontvangersaantal zijn verplicht; één keer in de wachtrij; elke ontvanger krijgt precies één mail met eigen afmeldlink", async () => {
    const { nl, id, admin } = await draft("members");
    await expect(nl.queueNewsletter(admin, id, { confirm: false, expectedCount: 2 })).rejects.toMatchObject({ code: "confirm_required" });
    await expect(nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 5 })).rejects.toMatchObject({ code: "count_changed" });
    expect(await nl.newsletterStats(id)).toMatchObject({ total: 0 });
    await nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 2 });
    await expect(nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 2 })).rejects.toMatchObject({ code: "not_draft" });
    await expect(nl.updateNewsletter(admin, id, { subject: "x", body: "y", audience: "members" })).rejects.toMatchObject({ code: "not_draft" });
    await expect(nl.deleteNewsletterDraft(admin, id)).rejects.toMatchObject({ code: "not_draft" });
    const r = await nl.processNewsletters(10, id);
    expect(r).toMatchObject({ sent: 2, remaining: 0 });
    expect(sent.map((s) => s.to).sort()).toEqual(["geldig@example.test", "gezin@example.test"]);
    const tokens = sent.map((s) => /\/afmelden\/([^"\s<]+)/.exec(s.html)![1]);
    expect(new Set(tokens).size).toBe(2); // eigen token per ontvanger
    for (const s of sent) expect(s.headers?.["List-Unsubscribe"]).toContain("api/nieuwsbrief/afmelden");
    expect((await nl.getNewsletter(id))!.status).toBe("sent");
    // herhaald verwerken verstuurt niets opnieuw
    expect(await nl.processNewsletters(10, id)).toMatchObject({ sent: 0, remaining: 0 });
    expect(sent).toHaveLength(2);
    // gedeeld adres: één verzendregel
    const { db, schema } = await import("@/db");
    expect((await db.select().from(schema.newsletterDelivery)).filter((d) => d.email === "gezin@example.test")).toHaveLength(1);
  });

  it("testmodus verstuurt hoogstens 3 mails; de rest wordt overgeslagen en nooit verstuurd", async () => {
    process.env.EMAIL_MODE = "test";
    const { nl, id, admin } = await draft("everyone");
    await nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 8 });
    expect(await nl.newsletterStats(id)).toMatchObject({ total: 8, pending: 3, suppressed: 5 });
    await nl.processNewsletters(50, id);
    expect(sent).toHaveLength(3);
    expect((await nl.getNewsletter(id))!.status).toBe("sent");
  });

  it("afmelden: ongeldige/gemanipuleerde tokens falen; geldig token meldt af (idempotent), wachtende mails vervallen, adres staat daarna niet meer in doelgroepen; audit zonder e-mailadres", async () => {
    const { nl, id, admin } = await draft("members");
    await nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 2 });
    const { db, schema } = await import("@/db");
    const deliveries = await db.select().from(schema.newsletterDelivery);
    const mine = deliveries.find((d) => d.email === "geldig@example.test")!;
    const good = nl.unsubscribeToken(mine.id);
    for (const bad of [null, "", "x", `${mine.id}.AAAA`, `${mine.id}.${good.split(".")[1]}x`, `00000000-0000-0000-0000-000000000000.${good.split(".")[1]}`, good + ".extra", 42]) {
      expect(await nl.unsubscribeByToken(bad), String(bad)).toBe(false);
    }
    expect(await nl.describeUnsubscribe(good)).toEqual({ masked: expect.stringMatching(/^g\*+@example\.test$/), alreadyUnsubscribed: false });
    expect(await nl.unsubscribeByToken(good)).toBe(true);
    expect(await nl.unsubscribeByToken(good)).toBe(true); // idempotent
    expect((await db.select().from(schema.newsletterOptout)).map((o) => o.email)).toEqual(["geldig@example.test"]);
    await nl.processNewsletters(10, id);
    expect(sent.map((s) => s.to)).toEqual(["gezin@example.test"]); // afgemeld adres krijgt niets meer
    expect((await nl.audienceRecipients("members")).emails).toEqual(["gezin@example.test"]);
    expect(JSON.stringify(await db.select().from(schema.auditEvent))).not.toContain("geldig@example.test");
    expect((await nl.describeUnsubscribe(good))!.alreadyUnsubscribed).toBe(true);
  });

  it("annuleren stopt wachtende verzendingen; mislukte verzendingen kunnen opnieuw worden geprobeerd", async () => {
    const { nl, id, admin } = await draft("members");
    await nl.queueNewsletter(admin, id, { confirm: true, expectedCount: 2 });
    failWith = { permanent: true };
    expect(await nl.processNewsletters(10, id)).toMatchObject({ sent: 0, failed: 2 });
    expect(await nl.newsletterStats(id)).toMatchObject({ failed: 2, pending: 0 });
    failWith = null;
    expect(await nl.retryFailedDeliveries(admin, id)).toBe(2);
    expect((await nl.getNewsletter(id))!.status).toBe("sending");
    await nl.cancelNewsletter(admin, id);
    expect(await nl.newsletterStats(id)).toMatchObject({ cancelled: 2, pending: 0 });
    expect((await nl.getNewsletter(id))!.status).toBe("cancelled");
    await nl.processNewsletters(10, id);
    expect(sent).toHaveLength(0);
  });

  it("testmail gaat naar het opgegeven eigen adres, niet naar leden; rechten alleen voor ledenbeheer en systeembeheer", async () => {
    const { nl, id, admin } = await draft("members");
    const r = await nl.sendTestNewsletter(admin, id, "ik@example.test");
    expect(r.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ik@example.test", subject: "[Testmail] Maandbrief" });
    expect(sent[0].headers).toBeUndefined();
    expect(can("manager", "newsletter.manage") && can("sysadmin", "newsletter.manage")).toBe(true);
    expect(can("scanner", "newsletter.manage") || can("member", "newsletter.manage")).toBe(false);
    const { db, schema } = await import("@/db");
    expect(await db.select().from(schema.newsletterDelivery)).toHaveLength(0);
    void eq;
  });
});

describe("nieuwsbrief plannen", () => {
  it("tijden in Europe/Amsterdam: zomer- en wintertijd, niet-bestaande en ongeldige tijden", async () => {
    const { amsterdamLocalToDate, formatAmsterdamLocal } = await import("@/lib/time");
    expect(amsterdamLocalToDate("2026-07-01T09:00")!.toISOString()).toBe("2026-07-01T07:00:00.000Z"); // CEST = UTC+2
    expect(amsterdamLocalToDate("2026-12-01T09:00")!.toISOString()).toBe("2026-12-01T08:00:00.000Z"); // CET = UTC+1
    expect(amsterdamLocalToDate("2026-03-29T02:30")).toBeNull(); // bestaat niet (zomertijd-overgang)
    expect(amsterdamLocalToDate("2026-13-01T09:00")).toBeNull();
    expect(amsterdamLocalToDate("morgen")).toBeNull();
    expect(formatAmsterdamLocal(new Date("2026-07-01T07:00:00Z"))).toBe("2026-07-01T09:00");
  });

  async function draft() {
    const { admin } = await members();
    const nl = await import("@/server/newsletter");
    const id = await nl.createNewsletter(admin, { subject: "Gepland", body: "tekst", audience: "members" });
    return { nl, id, admin };
  }
  const local = (offsetMinutes: number) => {
    return formatAmsterdamLocal(new Date(Date.now() + offsetMinutes * 60_000));
  };

  it("plannen vereist bevestiging en een geldig tijdstip (min. 10 minuten, max. een jaar); annuleren maakt er weer een concept van", async () => {
    const { nl, id, admin } = await draft();
    await expect(nl.scheduleNewsletter(admin, id, local(120), false)).rejects.toMatchObject({ code: "confirm_required" });
    await expect(nl.scheduleNewsletter(admin, id, "kapot", true)).rejects.toMatchObject({ code: "invalid_time" });
    await expect(nl.scheduleNewsletter(admin, id, local(3), true)).rejects.toMatchObject({ code: "too_soon" });
    await expect(nl.scheduleNewsletter(admin, id, local(60 * 24 * 400), true)).rejects.toMatchObject({ code: "too_far" });
    await nl.scheduleNewsletter(admin, id, local(120), true);
    const n = (await nl.getNewsletter(id))!;
    expect(n.status).toBe("scheduled");
    await expect(nl.updateNewsletter(admin, id, { subject: "x", body: "y", audience: "members" })).rejects.toMatchObject({ code: "not_draft" });
    await expect(nl.scheduleNewsletter(admin, id, local(180), true)).rejects.toMatchObject({ code: "not_draft" });
    expect(await nl.dispatchDueNewsletters()).toBe(0); // nog niet aan de beurt
    await nl.unscheduleNewsletter(admin, id);
    expect((await nl.getNewsletter(id))!).toMatchObject({ status: "draft", scheduledAt: null });
    await expect(nl.unscheduleNewsletter(admin, id)).rejects.toMatchObject({ code: "not_scheduled" });
  });

  it("op het verzendmoment worden de ontvangers dan bepaald (afmeldingen tellen mee), precies één keer gestart en normaal verstuurd", async () => {
    const { nl, id, admin } = await draft();
    await nl.scheduleNewsletter(admin, id, local(60), true);
    const { db, schema } = await import("@/db");
    await db.insert(schema.newsletterOptout).values({ email: "geldig@example.test" }); // afgemeld ná het plannen
    await db.update(schema.newsletter).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(schema.newsletter.id, id));
    expect(await nl.dispatchDueNewsletters()).toBe(1);
    expect(await nl.dispatchDueNewsletters()).toBe(0); // niet nogmaals
    expect(await nl.newsletterStats(id)).toMatchObject({ total: 1, pending: 1 }); // alleen het gezinsadres
    await nl.processNewsletters(10, id);
    expect(sent.map((s) => s.to)).toEqual(["gezin@example.test"]);
    expect((await nl.getNewsletter(id))!.status).toBe("sent");
    expect((await db.select().from(schema.auditEvent)).some((a) => a.action === "newsletter.send_scheduled")).toBe(true);
  });

  it("geen ontvangers meer op het verzendmoment: terug naar concept met foutmelding, niets verstuurd", async () => {
    const { nl, id, admin } = await draft();
    await nl.scheduleNewsletter(admin, id, local(60), true);
    const { db, schema } = await import("@/db");
    await db.insert(schema.newsletterOptout).values([{ email: "geldig@example.test" }, { email: "gezin@example.test" }]);
    await db.update(schema.newsletter).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(schema.newsletter.id, id));
    expect(await nl.dispatchDueNewsletters()).toBe(0);
    const n = (await nl.getNewsletter(id))!;
    expect(n).toMatchObject({ status: "draft", scheduledAt: null });
    expect(n.scheduleError).toMatch(/geen ontvangers/i);
    expect(sent).toHaveLength(0);
  });
});
