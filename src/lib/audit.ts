import { db, schema, type Tx } from "@/db";

/** Velden die nooit in audit-metadata mogen belanden. */
const FORBIDDEN = /pass(word)?|token|secret|code|hash|cipher|key/i;

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN.test(k) && k !== "passId" && k !== "passStatus") continue;
    out[k] = typeof v === "string" && v.length > 300 ? v.slice(0, 300) : v;
  }
  return out;
}

export async function audit(
  e: { actor: string | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
  tx: Tx | typeof db = db,
) {
  await tx.insert(schema.auditEvent).values({
    actorUserId: e.actor,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: sanitize(e.metadata ?? {}),
  });
}
