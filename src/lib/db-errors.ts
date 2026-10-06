/** Is dit een unieke-index-schending (Postgres 23505), optioneel voor een bepaalde index/constraint? (Drizzle verpakt de pg-fout in `cause`.) */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: string; constraint?: string; cause?: unknown };
    if (c.code === "23505" && (!constraint || c.constraint === constraint)) return true;
    cur = c.cause;
  }
  return false;
}
