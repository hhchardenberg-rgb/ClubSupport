/**
 * Statusregels van een pas — de ENIGE plek waar geldigheid wordt bepaald.
 *
 * - active       : de pas zelf is actief. Een scan is alleen geldig als OOK het lidmaatschap geldig is
 *                  (en het lid niet is gearchiveerd/verwijderd); betaalstatus speelt bewust GEEN rol.
 * - deactivated  : tijdelijk ongeldig; kan door een bevoegd account worden heractiveerd.
 * - revoked      : definitief ingetrokken (heruitgifte, verloren/gelekt, verwijderd).
 *                  Kan nooit meer actief worden.
 */
export const PASS_STATUSES = ["active", "deactivated", "revoked"] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export type ScanOutcome = "valid" | "inactive" | "revoked" | "unknown" | "membership_invalid";

/**
 * Geldigheid van een scan: de pas is actief ÉN het lid is niet verwijderd of gearchiveerd ÉN het lidmaatschap is op
 * dit moment geldig (zie `lib/membership.ts`). Een actieve pas maakt een beëindigd lidmaatschap niet geldig, en andersom.
 * `membershipValid` ontbreekt = onbekend = niet geldig (fail-safe).
 */
export type ValidityInput = { status: string; memberDeleted?: boolean; memberArchived?: boolean; membershipValid?: boolean };

export function isPassValid(input: ValidityInput): boolean {
  return input.status === "active" && !input.memberDeleted && !input.memberArchived && input.membershipValid === true;
}

export function scanOutcomeFor(input: ValidityInput): ScanOutcome {
  if (input.memberDeleted || input.status === "revoked") return "revoked";
  if (input.status === "deactivated") return "inactive";
  if (input.status === "active") return isPassValid(input) ? "valid" : "membership_invalid";
  return "unknown";
}

const TRANSITIONS: Record<PassStatus, PassStatus[]> = {
  active: ["deactivated", "revoked"],
  deactivated: ["active", "revoked"],
  revoked: [], // onomkeerbaar
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as PassStatus] ?? []).includes(to as PassStatus);
}

export const REVOCATION_REASONS = ["reissued", "lost", "leaked", "deleted", "admin"] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];
