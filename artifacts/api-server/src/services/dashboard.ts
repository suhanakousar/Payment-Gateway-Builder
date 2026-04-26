import { db } from "@workspace/db";
import { ordersTable, settlementsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { openCount as openDisputeCount } from "./disputes";

export interface DashboardSummary {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  failedOrders: number;
  refundedOrders: number;
  flaggedOrders: number;
  totalCollectedPaise: number;
  todayCollectedPaise: number;
  successRate: number;
  openDisputes: number;
  pendingSettlementPaise: number;
  pendingSettlementCount: number;
}

export async function summary(merchantId: string): Promise<DashboardSummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${ordersTable.status} = 'SUCCESS')::int`,
      pending: sql<number>`count(*) filter (where ${ordersTable.status} = 'PENDING')::int`,
      failed: sql<number>`count(*) filter (where ${ordersTable.status} = 'FAILED')::int`,
      refunded: sql<number>`count(*) filter (where ${ordersTable.status} = 'REFUNDED')::int`,
      flagged: sql<number>`count(*) filter (where ${ordersTable.fraudFlag} = true)::int`,
      collectedPaise: sql<string>`coalesce(sum(${ordersTable.amount}) filter (where ${ordersTable.status} = 'SUCCESS'), 0) * 100`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchantId));

  const [today] = await db
    .select({
      todayPaise: sql<string>`coalesce(sum(${ordersTable.amount}), 0) * 100`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, merchantId),
        eq(ordersTable.status, "SUCCESS"),
        gte(ordersTable.paidAt, startOfToday),
      ),
    );

  const [pendingSettle] = await db
    .select({
      paise: sql<string>`coalesce(sum(${settlementsTable.netPaise}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(settlementsTable)
    .where(
      and(
        eq(settlementsTable.merchantId, merchantId),
        eq(settlementsTable.status, "PENDING"),
      ),
    );

  const disputes = await openDisputeCount(merchantId);

  const total = row?.total ?? 0;
  const paid = row?.paid ?? 0;
  const collectedPaise = Math.round(Number(row?.collectedPaise ?? 0));
  const todayPaise = Math.round(Number(today?.todayPaise ?? 0));

  return {
    totalOrders: total,
    paidOrders: paid,
    pendingOrders: row?.pending ?? 0,
    failedOrders: row?.failed ?? 0,
    refundedOrders: row?.refunded ?? 0,
    flaggedOrders: row?.flagged ?? 0,
    totalCollectedPaise: collectedPaise,
    todayCollectedPaise: todayPaise,
    successRate: total > 0 ? Math.round((paid / total) * 1000) / 10 : 0,
    openDisputes: disputes,
    pendingSettlementPaise: Number(pendingSettle?.paise ?? 0),
    pendingSettlementCount: pendingSettle?.count ?? 0,
  };
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD
  paise: number;
  orders: number;
}

export async function dailyRevenue(
  merchantId: string,
  days = 14,
): Promise<TimeseriesPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`to_char(${ordersTable.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
      paise: sql<string>`coalesce(sum(${ordersTable.amount}), 0) * 100`,
      orders: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, merchantId),
        eq(ordersTable.status, "SUCCESS"),
        gte(ordersTable.paidAt, since),
      ),
    )
    .groupBy(sql`to_char(${ordersTable.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`);

  const map = new Map(rows.map((r) => [r.day, r]));
  const out: TimeseriesPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    out.push({
      date: key,
      paise: r ? Math.round(Number(r.paise)) : 0,
      orders: r?.orders ?? 0,
    });
  }
  return out;
}

export interface BreakdownPoint {
  label: string;
  value: number;
  paise: number;
}

export async function methodBreakdown(merchantId: string): Promise<BreakdownPoint[]> {
  const rows = await db
    .select({
      method: sql<string>`coalesce(${ordersTable.paymentMethod}, 'UPI')`,
      orders: sql<number>`count(*)::int`,
      paise: sql<string>`coalesce(sum(${ordersTable.amount}), 0) * 100`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, merchantId),
        eq(ordersTable.status, "SUCCESS"),
      ),
    )
    .groupBy(sql`coalesce(${ordersTable.paymentMethod}, 'UPI')`);
  return rows.map((r) => ({
    label: r.method,
    value: r.orders,
    paise: Math.round(Number(r.paise)),
  }));
}

export async function providerBreakdown(merchantId: string): Promise<BreakdownPoint[]> {
  const rows = await db
    .select({
      provider: ordersTable.provider,
      orders: sql<number>`count(*)::int`,
      paise: sql<string>`coalesce(sum(${ordersTable.amount}), 0) * 100`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, merchantId),
        eq(ordersTable.status, "SUCCESS"),
      ),
    )
    .groupBy(ordersTable.provider);
  return rows.map((r) => ({
    label: r.provider,
    value: r.orders,
    paise: Math.round(Number(r.paise)),
  }));
}
