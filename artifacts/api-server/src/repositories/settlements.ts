import { db } from "@workspace/db";
import {
  settlementsTable,
  ledgerEntriesTable,
  ordersTable,
  type Settlement,
  type LedgerEntry,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

export async function listForMerchant(
  merchantId: string,
  limit = 50,
): Promise<Settlement[]> {
  return db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.merchantId, merchantId))
    .orderBy(desc(settlementsTable.settlementDate))
    .limit(limit);
}

export async function findById(id: string): Promise<Settlement | null> {
  const rows = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Find SUCCESS orders for a merchant whose paidAt fell in [start, end) and
 * which haven't been settled yet.
 */
export async function findUnsettledOrders(opts: {
  merchantId: string;
  start: Date;
  end: Date;
}) {
  return db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, opts.merchantId),
        eq(ordersTable.status, "SUCCESS"),
        sql`${ordersTable.settlementId} is null`,
        gte(ordersTable.paidAt, opts.start),
        lt(ordersTable.paidAt, opts.end),
      ),
    );
}

/** Distinct merchant IDs that had SUCCESS orders in the day. */
export async function merchantsWithUnsettledForRange(opts: {
  start: Date;
  end: Date;
}): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: ordersTable.merchantId })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "SUCCESS"),
        sql`${ordersTable.settlementId} is null`,
        gte(ordersTable.paidAt, opts.start),
        lt(ordersTable.paidAt, opts.end),
      ),
    );
  return rows.map((r) => r.id);
}

export interface SettlementWrite {
  merchantId: string;
  settlementDate: string; // YYYY-MM-DD
  grossPaise: number;
  feePaise: number;
  refundPaise: number;
  netPaise: number;
  orderCount: number;
}

export async function createSettlementWithOrders(opts: {
  write: SettlementWrite;
  orderIds: string[];
  ledgerEntries: Omit<LedgerEntry, "id" | "createdAt" | "settlementId">[];
}): Promise<Settlement> {
  return db.transaction(async (tx) => {
    const [settlement] = await tx
      .insert(settlementsTable)
      .values({
        merchantId: opts.write.merchantId,
        settlementDate: opts.write.settlementDate,
        grossPaise: opts.write.grossPaise,
        feePaise: opts.write.feePaise,
        refundPaise: opts.write.refundPaise,
        netPaise: opts.write.netPaise,
        orderCount: opts.write.orderCount,
        status: "PENDING",
      })
      .returning();
    if (!settlement) throw new Error("Settlement insert failed");

    if (opts.orderIds.length > 0) {
      await tx
        .update(ordersTable)
        .set({ settlementId: settlement.id, settledAt: new Date() })
        .where(inArray(ordersTable.id, opts.orderIds));
    }

    if (opts.ledgerEntries.length > 0) {
      await tx.insert(ledgerEntriesTable).values(
        opts.ledgerEntries.map((e) => ({
          ...e,
          settlementId: settlement.id,
        })),
      );
    }

    return settlement;
  });
}

export async function markPaid(opts: {
  id: string;
  bankRef: string;
}): Promise<Settlement | null> {
  const [row] = await db
    .update(settlementsTable)
    .set({ status: "PAID", bankRef: opts.bankRef, paidAt: new Date() })
    .where(eq(settlementsTable.id, opts.id))
    .returning();
  return row ?? null;
}

export async function ledgerForMerchant(
  merchantId: string,
  limit = 200,
): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.merchantId, merchantId))
    .orderBy(desc(ledgerEntriesTable.createdAt))
    .limit(limit);
}
