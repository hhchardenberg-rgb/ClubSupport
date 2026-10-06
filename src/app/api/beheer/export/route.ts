import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { clientIp, sameOrigin } from "@/lib/http";
import { CATEGORY_LABEL, MEMBERSHIP_LABEL, memberCategory } from "@/lib/membership";
import { rateLimit } from "@/lib/ratelimit";
import { apiStaff } from "@/lib/session";
import { listMembersForExport, MEMBER_STATUS_FILTERS, MEMBERSHIP_FILTERS } from "@/server/admin";

export const dynamic = "force-dynamic";

const HEAD = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: HEAD });
const PASS: Record<string, string> = { active: "actief", deactivated: "gedeactiveerd" };

/**
 * Beveiligde ledenexport (CSV). Alleen POST met Origin-controle (CSRF), sessie + MFA + recht `members.export`,
 * begrensd per account, volledig geaudit (wie, welke filters, aantal rijen — geen persoonsgegevens).
 * Formule-injectie wordt in `toCsv` geneutraliseerd. Het bestand bevat nooit pastokens.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "forbidden");
  const session = await apiStaff("members.export");
  if (!session) return fail(401, "unauthorized");
  if (!(await rateLimit(`export:user:${session.user.id}`, 10, 3600)) || !(await rateLimit(`export:ip:${clientIp(req)}`, 30, 3600))) return fail(429, "rate_limited");
  const form = await req.formData().catch(() => null);
  const get = (k: string) => String(form?.get(k) ?? "").slice(0, 100);
  const status = (MEMBER_STATUS_FILTERS as readonly string[]).includes(get("status")) ? get("status") : undefined;
  const membership = (MEMBERSHIP_FILTERS as readonly string[]).includes(get("membership")) ? get("membership") : undefined;
  const q = get("q") || undefined;
  const rows = await listMembersForExport({ q, status, membership });
  await audit({ actor: session.user.id, action: "members.export", metadata: { rows: rows.length, status: status ?? null, membership: membership ?? null, hasQuery: !!q } });
  const csv = toCsv([
    ["lidnummer", "naam", "email", "externe_referentie", "categorie", "lidmaatschap", "begindatum", "einddatum", "pas", "gearchiveerd", "notitie"],
    ...rows.map((r) => [
      r.memberNumber, r.fullName, r.email ?? "", r.externalRef ?? "", CATEGORY_LABEL[memberCategory(r.membership)], MEMBERSHIP_LABEL[r.membership], r.msStart ?? "", r.msEnd ?? "",
      r.deletedAt ? "verwijderd" : PASS[r.passStatus ?? ""] ?? "geen", r.archivedAt ? "ja" : "nee", r.note ?? "",
    ]),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, { headers: { ...HEAD, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hhc-leden-${day}.csv"` } });
}
