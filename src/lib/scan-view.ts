/**
 * Vertaalt een serverantwoord naar wat de controleur ziet.
 * FAIL-SAFE: alleen een exact verwacht 200-antwoord met outcome "valid" (plus naam en lidnummer) toont GELDIG.
 * Elke fout, time-out, ontbrekend of onverwacht antwoord → "unchecked" (Niet gecontroleerd — verbinding nodig).
 */
export type ScanView =
  | { kind: "valid"; name: string; memberNumber: string }
  | { kind: "inactive"; name: string; memberNumber: string }
  | { kind: "revoked" }
  | { kind: "unknown" }
  | { kind: "wait" }
  | { kind: "session" }
  | { kind: "unchecked" };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

export function interpretScan(status: number | null, body: unknown): ScanView {
  if (status === null) return { kind: "unchecked" }; // netwerkfout/time-out
  if (status === 401 || status === 403) return { kind: "session" };
  if (status === 429) return { kind: "wait" };
  if (status !== 200 || !body || typeof body !== "object") return { kind: "unchecked" };
  const b = body as Record<string, unknown>;
  switch (b.outcome) {
    case "valid":
      return isStr(b.name) && isStr(b.memberNumber) ? { kind: "valid", name: b.name, memberNumber: b.memberNumber } : { kind: "unchecked" };
    case "inactive":
      return isStr(b.name) && isStr(b.memberNumber) ? { kind: "inactive", name: b.name, memberNumber: b.memberNumber } : { kind: "unchecked" };
    case "revoked":
      return { kind: "revoked" };
    case "unknown":
      return { kind: "unknown" };
    case "rate_limited":
      return { kind: "wait" };
    default:
      return { kind: "unchecked" };
  }
}
