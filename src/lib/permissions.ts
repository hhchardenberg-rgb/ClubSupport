/**
 * Rollen en rechten (minimale rechten). Eén rol per account.
 * Elke route en mutatie controleert server-side via `can()` / session-guards.
 */
export const ROLES = ["member", "scanner", "manager", "sysadmin"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "member.self", // eigen gekoppelde leden/passen bekijken
  "scan", // pas scannen
  "members.read",
  "members.write",
  "passes.manage", // aanmaken, deactiveren, heruitgeven, verwijderen
  "access.manage", // account <-> lid koppelen
  "import",
  "email.view",
  "staff.manage", // staf-accounts en rollen
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = ["scan", "members.read", "members.write", "passes.manage", "access.manage", "import", "email.view"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  member: ["member.self"],
  scanner: ["scan"],
  manager: MANAGER,
  sysadmin: [...MANAGER, "staff.manage", "audit.read"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as Role].includes(permission);
}

export const STAFF_ROLES: readonly Role[] = ["scanner", "manager", "sysadmin"];
export const isStaff = (role: string) => (STAFF_ROLES as readonly string[]).includes(role);
