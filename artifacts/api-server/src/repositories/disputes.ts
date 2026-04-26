import { db } from "@workspace/db";
import { disputesTable, type Dispute, type InsertDispute } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

export async function create(values: InsertDispute): Promise<Dispute> {
  const [row] = await db.insert(disputesTable).values(values).returning();
  return row!;
}

export async function listForMerchant(
  merchantId: string,
  limit = 100,
): Promise<Dispute[]> {
  return db
    .select()
    .from(disputesTable)
    .where(eq(disputesTable.merchantId, merchantId))
    .orderBy(desc(disputesTable.createdAt))
    .limit(limit);
}

export async function findForMerchant(
  id: string,
  merchantId: string,
): Promise<Dispute | null> {
  const rows = await db
    .select()
    .from(disputesTable)
    .where(
      and(eq(disputesTable.id, id), eq(disputesTable.merchantId, merchantId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function submitEvidence(opts: {
  id: string;
  merchantId: string;
  evidenceText: string;
  evidenceUrl: string | null;
}): Promise<Dispute | null> {
  const [row] = await db
    .update(disputesTable)
    .set({
      evidenceText: opts.evidenceText,
      evidenceUrl: opts.evidenceUrl,
      status: "UNDER_REVIEW",
      submittedAt: new Date(),
    })
    .where(
      and(
        eq(disputesTable.id, opts.id),
        eq(disputesTable.merchantId, opts.merchantId),
        eq(disputesTable.status, "OPEN"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function resolve(opts: {
  id: string;
  status: "WON" | "LOST";
  note: string;
}): Promise<Dispute | null> {
  const [row] = await db
    .update(disputesTable)
    .set({
      status: opts.status,
      resolutionNote: opts.note,
      resolvedAt: new Date(),
    })
    .where(eq(disputesTable.id, opts.id))
    .returning();
  return row ?? null;
}

export async function countOpenForMerchant(merchantId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(disputesTable)
    .where(
      and(
        eq(disputesTable.merchantId, merchantId),
        sql`${disputesTable.status} in ('OPEN','UNDER_REVIEW')`,
      ),
    );
  return rows[0]?.c ?? 0;
}

export async function findOpenForOrder(orderId: string): Promise<Dispute | null> {
  const rows = await db
    .select()
    .from(disputesTable)
    .where(
      and(
        eq(disputesTable.orderId, orderId),
        sql`${disputesTable.status} in ('OPEN','UNDER_REVIEW')`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
