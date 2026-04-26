import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";

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
  };
}
