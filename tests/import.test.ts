import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";

const sent: string[] = [];
vi.mock("@/server/email/provider", () => ({
  sendMail: async (to: string, mail: { subject: string }) => (sent.push(`${mail.subject}|${to}`), { ok: true, ref: "r" }),
}));

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

const CSV = (rows: string[]) => ["lidnummer,naam,email,notitie", ...rows].join("\n");

describe("CSV-preview (tests 6, 12)", () => {
  it("detecteert ontbrekende velden, ongeldige rijen, dubbele nummers en bestaande nummers vóór import", async () => {
    const { previewImport } = await import("@/server/import");
    const { createMemberWithPass } = await import("@/server/accounts");
    const admin = await makeUser("admin1", "manager");
    await createMemberWithPass(admin, { memberNumber: "100", fullName: "Bestaand", email: null });
    const p = await previewImport(admin, CSV(["1,Ok Een,ok@example.test,", ",Zonder Nummer,a@example.test,", "2,,b@example.test,", "3,Slecht Mail,geen-mail,", "1,Dubbel,c@example.test,", "100,Bestaat Al,d@example.test,", "4,Tekens,e@example.test,\u0007"]));
    const byLine = Object.fromEntries(p.rows.map((r) => [r.line, r]));
    expect(byLine[2].status).toBe("import");
    expect(byLine[3].errors.join()).toMatch(/Lidnummer ontbreekt/);
    expect(byLine[4].errors.join()).toMatch(/Naam ontbreekt/);
    expect(byLine[5].errors.join()).toMatch(/Ongeldig e-mailadres/);
    expect(byLine[6].errors.join()).toMatch(/Dubbel lidnummer/);
    expect(byLine[7].errors.join()).toMatch(/bestaat al/);
    expect(byLine[8].errors.join()).toMatch(/Ongeldige tekens/);
    expect(p.counts).toMatchObject({ total: 7, import: 1, error: 6 });
    // preview voert geen acties uit
    const { db, schema } = await import("@/db");
    expect(await db.select().from(schema.member)).toHaveLength(1);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, "ok@example.test"))).toHaveLength(0);
    // alleen de outbox-rij van het vooraf aangemaakte lid (zonder adres); de preview maakt niets klaar
    expect((await db.select().from(schema.emailOutbox)).map((o) => o.status)).toEqual(["not_sent_no_address"]);
    expect(sent).toHaveLength(0);
  });

  it("weigert onbekende kolommen, ontbrekende verplichte kolommen en te grote/lege bestanden", async () => {
    const { previewImport } = await import("@/server/import");
    const admin = await makeUser("admin1", "manager");
    await expect(previewImport(admin, "lidnummer,naam,wachtwoord\n1,a,b")).rejects.toThrow(/Onbekende kolom/);
    await expect(previewImport(admin, "naam,email\na,b@example.test")).rejects.toThrow(/lidnummer/);
    await expect(previewImport(admin, "")).rejects.toThrow(/leeg/);
    await expect(previewImport(admin, 'lidnummer,naam\n1,"open')).rejects.toThrow(/aanhalingsteken/);
  });

  it("formules en HTML worden als tekst behandeld; export neutraliseert formule-injectie", async () => {
    const { previewImport } = await import("@/server/import");
    const { csvCell, toCsv } = await import("@/lib/csv");
    const admin = await makeUser("admin1", "manager");
    const p = await previewImport(admin, CSV(['5,"=HYPERLINK(""http://evil"")",f@example.test,', '6,<script>alert(1)</script>,g@example.test,']));
    expect(p.rows[0].fullName).toBe('=HYPERLINK("http://evil")'); // onaangetast als tekst bewaard
    expect(p.rows[1].fullName).toBe("<script>alert(1)</script>");
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"]) expect(csvCell(v).startsWith(`"'`)).toBe(true);
    expect(toCsv([["naam"], ["=cmd|' /C calc'!A0"]])).toContain(`"'=cmd`);
  });

  it("gedeeld e-mailadres: groep zichtbaar, geen dubbele leden, bevestiging verplicht, één uitnodiging", async () => {
    const { previewImport, commitImport } = await import("@/server/import");
    const { db, schema } = await import("@/db");
    const admin = await makeUser("admin1", "manager");
    const p = await previewImport(admin, CSV(["10,Ouder,gezin@example.test,", "11,Kind Een,GEZIN@example.test,", "12,Kind Twee,gezin@example.test,", "13,Alleen,solo@example.test,"]));
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]).toMatchObject({ email: "gezin@example.test", lines: [2, 3, 4], existingAccount: false });
    expect(p.rows.filter((r) => r.errors.length)).toHaveLength(0); // geen duplicaten-fout
    await expect(commitImport(admin, p.batchId, { confirmGroups: false })).rejects.toMatchObject({ code: "confirm_groups_required" });
    expect(await db.select().from(schema.member)).toHaveLength(0);
    expect(sent).toHaveLength(0);
    const r = await commitImport(admin, p.batchId, { confirmGroups: true });
    expect(r).toEqual({ imported: 4, skipped: 0 });
    expect(await db.select().from(schema.member)).toHaveLength(4);
    expect((await db.select().from(schema.user).where(eq(schema.user.email, "gezin@example.test")))).toHaveLength(1);
    expect(await db.select().from(schema.accountMemberAccess)).toHaveLength(4);
    expect(sent.filter((s) => s.includes("Activeer"))).toHaveLength(2); // gezin + solo, niet 4
    await expect(commitImport(admin, p.batchId, { confirmGroups: true })).rejects.toMatchObject({ code: "already_committed" });
    const [b] = await db.select().from(schema.importBatch);
    expect(b.rows).toBeNull(); // persoonsgegevens gewist
    const audit = JSON.stringify(await db.select().from(schema.auditEvent));
    expect(audit).not.toMatch(/gezin@example|Kind Een/); // geen onnodige persoonsgegevens in audit
  });

  it("alleen foutloze rijen worden geïmporteerd; andere beheerder kan batch niet gebruiken", async () => {
    const { previewImport, commitImport } = await import("@/server/import");
    const { db, schema } = await import("@/db");
    const a = await makeUser("admin1", "manager");
    const b = await makeUser("admin2", "manager");
    const p = await previewImport(a, CSV(["20,Goed,h@example.test,", "21,Fout,geen,"]));
    await expect(commitImport(b, p.batchId, { confirmGroups: true })).rejects.toMatchObject({ code: "not_found" });
    expect(await commitImport(a, p.batchId, { confirmGroups: false })).toEqual({ imported: 1, skipped: 1 });
    expect(await db.select().from(schema.member)).toHaveLength(1);
  });

  it("koppeling aan bestaand account in de preview getoond en bevestigd", async () => {
    const { previewImport } = await import("@/server/import");
    const { createMemberWithPass } = await import("@/server/accounts");
    const admin = await makeUser("admin1", "manager");
    await createMemberWithPass(admin, { memberNumber: "1", fullName: "Eerste", email: "x@example.test" });
    const p = await previewImport(admin, CSV(["2,Tweede,x@example.test,"]));
    expect(p.groups[0]).toMatchObject({ existingAccount: true, existingMembers: 1 });
  });
});
