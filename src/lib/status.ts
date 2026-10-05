/**
 * Statusregels van een pas — de ENIGE plek waar geldigheid wordt bepaald.
 *
 * - active       : geldig. Blijft geldig tot een beheerder deactiveert of intrekt.
 *                  Tijd, betaalstatus of ledenstatus spelen bewust GEEN rol.
 * - deactivated  : tijdelijk ongeldig; kan door een bevoegd account worden heractiveerd.
 * - revoked      : definitief ingetrokken (heruitgifte, verloren/gelekt, verwijderd).
 *                  Kan nooit meer actief worden.
 */
export const PASS_STATUSES = ["active", "deactivated", "revoked"] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export type ScanOutcome = "valid" | "inactive" | "revoked" | "unknown";

export function isPassValid(input: { status: string; memberDeleted?: boolean }): boolean {
  return input.status === "active" && !input.memberDeleted;
}

export function scanOutcomeFor(input: { status: string; memberDeleted?: boolean }): ScanOutcome {
  if (input.memberDeleted || input.status === "revoked") return "revoked";
  if (input.status === "deactivated") return "inactive";
  if (input.status === "active") return "valid";
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
