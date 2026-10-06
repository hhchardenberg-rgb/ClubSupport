/**
 * Rollen en rechten (minimale rechten). Eén rol per account.
 * Elke route en mutatie controleert server-side via `can()` / session-guards.
 */
export const ROLES = ["member", "scanner", "manager", "sysadmin"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "member.self", // eigen gekoppelde leden/passen bekijken
  "scan", // pas scannen
  "members.lookup", // beperkt zoeken (naam/lidnummer) voor controle zonder pas: alleen naam, lidnummer, passtatus
  "members.read",
  "members.write", // leden en lidmaatschappen wijzigen, archiveren
  "members.delete", // lid definitief laten verwijderen (na archivering, volgens bewaartermijn)
  "members.export", // ledenlijst exporteren (CSV)
  "passes.manage", // aanmaken, deactiveren, heruitgeven, verwijderen
  "access.manage", // account <-> lid koppelen
  "import",
  "email.view",
  "staff.manage", // staf-accounts en rollen
  "audit.read",
  "scanlog.read", // controlelogboek (wie scande/zocht wat en wanneer)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = ["scan", "members.lookup", "scanlog.read", "members.read", "members.write", "members.delete", "members.export", "passes.manage", "access.manage", "import", "email.view"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  member: ["member.self"],
  scanner: ["scan", "members.lookup"],
  manager: MANAGER,
  sysadmin: [...MANAGER, "staff.manage", "audit.read"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as Role].includes(permission);
}

export const STAFF_ROLES: readonly Role[] = ["scanner", "manager", "sysadmin"];
export const isStaff = (role: string) => (STAFF_ROLES as readonly string[]).includes(role);
