import "server-only";
import { eq, isNotNull, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { setGoogleObjectState } from "@/wallet/google";

/**
 * Probeert Google Wallet-objecten van een lid te laten volgen op de passtatus. Fouten worden genegeerd:
 * Wallet is een handige weergave, de database en de online scanner blijven leidend.
 */
export async function syncGoogleForMember(memberId: string): Promise<void> {
  try {
    const rows = await db.select({ objectId: schema.pass.googleObjectId, status: schema.pass.status }).from(schema.pass).where(and(eq(schema.pass.memberId, memberId), isNotNull(schema.pass.googleObjectId)));
    await Promise.allSettled(rows.map((r) => setGoogleObjectState(r.objectId!, r.status === "active" ? "ACTIVE" : "INACTIVE")));
  } catch {
    /* bewust genegeerd */
  }
}
