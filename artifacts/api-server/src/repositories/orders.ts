import { db } from "@workspace/db";
import { ordersTable, type Order, type InsertOrder } from "@workspace/db";
import { and, desc, eq, gte, lte, sql, ilike, or } from "drizzle-orm";

export async function insertOrder(values: InsertOrder): Promise<Order> {
  const [row] = await db.insert(ordersTable).values(values).returning();
  return row!;
}

export async function findById(id: string): Promise<Order | null> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findByTxn(txnId: string): Promise<Order | null> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.txnId, txnId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findForMerchant(
  id: string,
  merchantId: string,
): Promise<Order | null> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.merchantId, merchantId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface OrderListFilters {
  merchantId: string;
  status?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

function whereForFilters(f: OrderListFilters) {
  const clauses = [eq(ordersTable.merchantId, f.merchantId)];
  if (f.status) clauses.push(eq(ordersTable.status, f.status));
  if (f.from) clauses.push(gte(ordersTable.createdAt, f.from));
  if (f.to) clauses.push(lte(ordersTable.createdAt, f.to));
  if (f.search) {
    const q = `%${f.search}%`;
    const search = or(
      ilike(ordersTable.orderId, q),
      ilike(ordersTable.customerName, q),
      ilike(ordersTable.customerEmail, q),
      ilike(ordersTable.note, q),
    );
    if (search) clauses.push(search);
  }
  return and(...clauses);
}

export async function listForMerchant(f: OrderListFilters): Promise<Order[]> {
  return db
    .select()
    .from(ordersTable)
    .where(whereForFilters(f))
    .orderBy(desc(ordersTable.createdAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
}

export async function exportForMerchant(f: OrderListFilters): Promise<Order[]> {
  return db
    .select()
    .from(ordersTable)
    .where(whereForFilters(f))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10000);
}

export async function countDuplicateAmount(opts: {
  merchantId: string;
  amount: string;
  withinMs: number;
}): Promise<number> {
  const since = new Date(Date.now() - opts.withinMs);
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, opts.merchantId),
        eq(ordersTable.amount, opts.amount),
        gte(ordersTable.createdAt, since),
      ),
    );
  return rows[0]?.c ?? 0;
}

export async function countRecentForMerchant(opts: {
  merchantId: string;
  withinMs: number;
}): Promise<number> {
  const since = new Date(Date.now() - opts.withinMs);
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, opts.merchantId),
        gte(ordersTable.createdAt, since),
      ),
    );
  return rows[0]?.c ?? 0;
}

export async function markPaid(opts: {
  orderId: string;
  txnId: string;
  paymentMethod?: string | null;
  feePaise?: number;
}): Promise<Order | null> {
  const set: Record<string, unknown> = {
    status: "SUCCESS",
    paidAt: new Date(),
    txnId: opts.txnId,
  };
  if (opts.paymentMethod) set["paymentMethod"] = opts.paymentMethod;
  if (typeof opts.feePaise === "number") set["feePaise"] = opts.feePaise;
  const [row] = await db
    .update(ordersTable)
    .set(set)
    .where(eq(ordersTable.id, opts.orderId))
    .returning();
  return row ?? null;
}

export async function markFailed(orderId: string): Promise<Order | null> {
  const [row] = await db
    .update(ordersTable)
    .set({ status: "FAILED" })
    .where(eq(ordersTable.id, orderId))
    .returning();
  return row ?? null;
}

export async function markRefund(opts: {
  orderId: string;
  status: string;
  amount: string;
}): Promise<Order | null> {
  const [row] = await db
    .update(ordersTable)
    .set({
      refundStatus: opts.status,
      refundAmount: opts.amount,
      refundedAt: opts.status === "SUCCESS" ? new Date() : null,
      status: opts.status === "SUCCESS" ? "REFUNDED" : "SUCCESS",
    })
    .where(eq(ordersTable.id, opts.orderId))
    .returning();
  return row ?? null;
}

export async function flagFraud(opts: {
  orderId: string;
  reason: string;
}): Promise<void> {
  await db
    .update(ordersTable)
    .set({ fraudFlag: true, fraudReason: opts.reason })
    .where(eq(ordersTable.id, opts.orderId));
}

export async function expireOlderThan(now: Date): Promise<Order[]> {
  return db
    .update(ordersTable)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(ordersTable.status, "PENDING"),
        lte(ordersTable.expiresAt, now),
      ),
    )
    .returning();
}

export async function listPendingNeedingReconcile(opts: {
  olderThanMs: number;
  limit: number;
}): Promise<Order[]> {
  const cutoff = new Date(Date.now() - opts.olderThanMs);
  return db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "PENDING"),
        lte(ordersTable.createdAt, cutoff),
      ),
    )
    .limit(opts.limit);
}
