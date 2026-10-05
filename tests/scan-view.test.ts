import { describe, expect, it } from "vitest";
import { interpretScan } from "@/lib/scan-view";

describe("scanner toont nooit 'geldig' zonder geslaagde serverbevestiging (test 8)", () => {
  it("netwerkfout / time-out → niet gecontroleerd", () => {
    expect(interpretScan(null, null).kind).toBe("unchecked");
    expect(interpretScan(null, { outcome: "valid", name: "A", memberNumber: "1" }).kind).toBe("unchecked");
  });
  it("serverfouten en onverwachte antwoorden → niet gecontroleerd, nooit geldig", () => {
    for (const status of [500, 502, 503, 504, 404, 418, 204, 301]) {
      expect(interpretScan(status, { outcome: "valid", name: "A", memberNumber: "1" }).kind, String(status)).not.toBe("valid");
    }
    for (const body of [null, undefined, "valid", 42, [], {}, { outcome: "VALID" }, { outcome: "valid" }, { outcome: "valid", name: "", memberNumber: "1" }, { outcome: "valid", name: "A" }, { outcome: "valid", name: 5, memberNumber: "1" }, { outcome: "ok" }]) {
      expect(interpretScan(200, body).kind).not.toBe("valid");
    }
  });
  it("sessie verlopen en rate limit zijn eigen, niet-geldige statussen", () => {
    expect(interpretScan(401, {}).kind).toBe("session");
    expect(interpretScan(403, {}).kind).toBe("session");
    expect(interpretScan(429, {}).kind).toBe("wait");
  });
  it("alleen een exact verwacht 200-antwoord geeft GELDIG, met naam en lidnummer", () => {
    expect(interpretScan(200, { outcome: "valid", name: "Anna", memberNumber: "1001" })).toEqual({ kind: "valid", name: "Anna", memberNumber: "1001" });
  });
  it("aparte staten voor gedeactiveerd, ingetrokken en onbekend", () => {
    expect(interpretScan(200, { outcome: "inactive", name: "Anna", memberNumber: "1" }).kind).toBe("inactive");
    expect(interpretScan(200, { outcome: "revoked" }).kind).toBe("revoked");
    expect(interpretScan(200, { outcome: "unknown" }).kind).toBe("unknown");
  });
});
