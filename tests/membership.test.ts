import { describe, expect, it } from "vitest";
import { amsterdamToday, effectiveMembership, effectiveOf, parseDateInput } from "@/lib/membership";
import { isPassValid, scanOutcomeFor } from "@/lib/status";
import { can, ROLE_PERMISSIONS } from "@/lib/permissions";
import { buildRows, parseMemberCsv, suggestMapping } from "@/lib/csv";

const T = "2026-07-01";

describe("lidmaatschap: effectieve status en datums (Europe/Amsterdam)", () => {
  it("actief zonder datums is geldig; geschorst en beëindigd nooit, ook niet binnen de datums", () => {
    expect(effectiveOf({ status: "active", startDate: null, endDate: null }, T)).toBe("valid");
    expect(effectiveOf({ status: "suspended", startDate: "2020-01-01", endDate: "2099-01-01" }, T)).toBe("suspended");
    expect(effectiveOf({ status: "ended", startDate: null, endDate: null }, T)).toBe("ended");
    expect(effectiveOf({ status: "onzin", startDate: null, endDate: null }, T)).toBe("none"); // fail-safe
  });
  it("begin- en einddatum zijn inclusief; daarbuiten nog niet gestart of verlopen", () => {
    expect(effectiveOf({ status: "active", startDate: T, endDate: T }, T)).toBe("valid"); // één dag
    expect(effectiveOf({ status: "active", startDate: "2026-07-02", endDate: null }, T)).toBe("scheduled");
    expect(effectiveOf({ status: "active", startDate: null, endDate: "2026-06-30" }, T)).toBe("expired");
  });
  it("geen lidmaatschap = niet geldig; meerdere regels: één lopende geldige regel wint van oudere beëindigde", () => {
    expect(effectiveMembership([], T)).toBe("none");
    expect(effectiveMembership([{ status: "ended", startDate: null, endDate: "2025-12-31" }, { status: "active", startDate: "2026-01-01", endDate: null }], T)).toBe("valid");
    expect(effectiveMembership([{ status: "ended", startDate: null, endDate: null }], T)).toBe("ended");
  });
  it("de datum van vandaag volgt de tijdzone Europe/Amsterdam (niet UTC)", () => {
    expect(amsterdamToday(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01"); // zomertijd: 00:30 lokaal
    expect(amsterdamToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // wintertijd: 00:30 lokaal
    expect(amsterdamToday(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01");
  });
  it("datuminvoer: JJJJ-MM-DD en DD-MM-JJJJ; onmogelijke datums worden geweigerd", () => {
    expect(parseDateInput("2026-02-28")).toBe("2026-02-28");
    expect(parseDateInput("1-3-2026")).toBe("2026-03-01");
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("31-04-2026")).toBeNull();
    expect(parseDateInput("morgen")).toBeNull();
  });
});

describe("scanregel: pas actief ÉN lidmaatschap geldig", () => {
  it("een actieve pas is zonder geldig lidmaatschap niet geldig, en andersom", () => {
    expect(isPassValid({ status: "active", membershipValid: true })).toBe(true);
    expect(isPassValid({ status: "active", membershipValid: false })).toBe(false);
    expect(isPassValid({ status: "active" })).toBe(false); // onbekend = niet geldig
    expect(isPassValid({ status: "deactivated", membershipValid: true })).toBe(false);
    expect(isPassValid({ status: "active", membershipValid: true, memberArchived: true })).toBe(false);
    expect(scanOutcomeFor({ status: "active", membershipValid: false })).toBe("membership_invalid");
    expect(scanOutcomeFor({ status: "deactivated", membershipValid: false })).toBe("inactive");
    expect(scanOutcomeFor({ status: "revoked", membershipValid: true })).toBe("revoked");
  });
});

describe("rollen en rechten", () => {
  it("scanner heeft geen toegang tot de ledenadministratie; ledenbeheerder kan geen rollen beheren", () => {
    for (const p of ["members.read", "members.write", "members.export", "members.delete", "import", "access.manage", "passes.manage", "staff.manage", "audit.read"] as const) expect(can("scanner", p)).toBe(false);
    expect(can("scanner", "scan")).toBe(true);
    expect(can("manager", "members.write") && can("manager", "members.export") && can("manager", "members.delete") && can("manager", "access.manage") && can("manager", "passes.manage") && can("manager", "import")).toBe(true);
    expect(can("manager", "staff.manage")).toBe(false);
    expect(can("manager", "audit.read")).toBe(false);
    expect(can("sysadmin", "staff.manage")).toBe(true);
    expect(ROLE_PERMISSIONS.member).toEqual(["member.self"]);
    expect(can("member", "members.read")).toBe(false);
    expect(can(undefined, "scan")).toBe(false);
  });
});

describe("CSV: kolomkoppeling en nieuwe velden", () => {
  const ok = (e: string) => /@/.test(e);
  const norm = (e: string) => e.trim().toLowerCase();
  it("herkent extra kolommen en laat een eigen koppeling toe", () => {
    const s = suggestMapping(["Lidnummer", "Naam", "E-mail", "Status", "Begindatum", "Einddatum", "Extern", "Rare kolom"]);
    expect(s.columns).toEqual(["memberNumber", "fullName", "email", "membershipStatus", "startDate", "endDate", "", ""]);
    expect(s.unknown).toEqual(["Extern", "Rare kolom"]);
    const rows = buildRows([["1", "A", "a@x.nl", "Geschorst", "01-02-2026", "2026-12-31", "EXT-1", "x"]], ["memberNumber", "fullName", "email", "membershipStatus", "startDate", "endDate", "externalRef", ""], ok, norm);
    expect(rows[0]).toMatchObject({ membershipStatus: "suspended", startDate: "2026-02-01", endDate: "2026-12-31", externalRef: "EXT-1", errors: [] });
  });
  it("valideert status, datums, bereik en dubbele externe referenties; plus-adressen blijven ongemoeid", () => {
    const cols = ["memberNumber", "fullName", "email", "membershipStatus", "startDate", "endDate", "externalRef"] as const;
    const rows = buildRows([["1", "A", "a+tag@x.nl", "weird", "", "", "R1"], ["2", "B", "", "", "31-02-2026", "", "R1"], ["3", "C", "", "", "2026-05-02", "2026-05-01", ""]], [...cols], ok, norm);
    expect(rows[0].errors.join()).toMatch(/lidmaatschapsstatus/);
    expect(rows[0].email).toBe("a+tag@x.nl"); // geen verwijdering van plus-tags
    expect(rows[1].errors.join()).toMatch(/begindatum/);
    expect(rows[1].errors.join()).toMatch(/Dubbele externe referentie/);
    expect(rows[2].errors.join()).toMatch(/Einddatum ligt vóór/);
  });
  it("de strikte parser weigert nog steeds onbekende kolommen", () => {
    expect(() => parseMemberCsv("lidnummer,naam,wachtwoord\n1,a,b", ok, norm)).toThrow(/Onbekende kolom/);
  });
});
