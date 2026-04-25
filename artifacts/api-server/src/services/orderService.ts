import { db, ordersTable, merchantsTable } from "@workspace/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { createProviderOrder } from "../lib/paymentProvider";

const ORDER_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function serializeOrder(row: typeof ordersTable.$inferSelect) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    orderId: row.orderId,
    txnId: row.txnId ?? null,
    amount: Number(row.amount),
    status: row.status as "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED",
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    note: row.note ?? null,
    qrString: row.qrString ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  };
}

async function expireStaleOrders() {
  await db
    .update(ordersTable)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(ordersTable.status, "PENDING"),
        lt(ordersTable.expiresAt, new Date()),
      ),
    );
}

export async function listOrdersForMerchant(
  merchantId: string,
  limit: number,
) {
  await expireStaleOrders();
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchantId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);
  return rows.map(serializeOrder);
}

export async function createOrderForMerchant(input: {
  merchantId: string;
  orderId: string;
  amount: number;
  customerName?: string | undefined;
  customerEmail?: string | undefined;
  note?: string | undefined;
}) {
  const [merchant] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, input.merchantId))
    .limit(1);
  if (!merchant) throw new Error("Merchant not found");

  const provider = await createProviderOrder({
    orderId: input.orderId,
    amount: input.amount,
    businessName: merchant.businessName,
  });

  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);

  const [row] = await db
    .insert(ordersTable)
    .values({
      merchantId: input.merchantId,
      orderId: input.orderId,
      txnId: provider.txnId,
      amount: input.amount.toFixed(2),
      status: "PENDING",
      customerName: input.customerName ?? null,
      customerEmail: input.customerEmail ?? null,
      note: input.note ?? null,
      qrString: provider.qrString,
      expiresAt,
    })
    .returning();

  if (!row) throw new Error("Failed to create order");

  return {
    order: serializeOrder(row),
    qrString: provider.qrString,
    qrImage: provider.qrImage,
    paymentUrl: provider.qrString,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getPublicOrder(orderRowId: string) {
  await expireStaleOrders();
  const rows = await db
    .select({
      order: ordersTable,
      businessName: merchantsTable.businessName,
    })
    .from(ordersTable)
    .innerJoin(merchantsTable, eq(merchantsTable.id, ordersTable.merchantId))
    .where(eq(ordersTable.id, orderRowId))
    .limit(1);
  const found = rows[0];
  if (!found) return null;

  const o = found.order;
  const { qrImage } = await import("../lib/paymentProvider").then(async () => {
    if (!o.qrString) return { qrImage: "" };
    const QRCode = (await import("qrcode")).default;
    return {
      qrImage: await QRCode.toDataURL(o.qrString, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320,
      }),
    };
  });

  return {
    id: o.id,
    orderId: o.orderId,
    amount: Number(o.amount),
    status: o.status as "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED",
    businessName: found.businessName,
    qrString: o.qrString ?? "",
    qrImage,
    note: o.note ?? null,
    createdAt: o.createdAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
  };
}

export async function getOrderForSimulation(orderRowId: string) {
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderRowId))
    .limit(1);
  return row ?? null;
}

export async function dashboardSummaryForMerchant(merchantId: string) {
  await expireStaleOrders();
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`sum(case when ${ordersTable.status} = 'SUCCESS' then 1 else 0 end)::int`,
      failed: sql<number>`sum(case when ${ordersTable.status} = 'FAILED' then 1 else 0 end)::int`,
      pending: sql<number>`sum(case when ${ordersTable.status} = 'PENDING' then 1 else 0 end)::int`,
      revenue: sql<string>`coalesce(sum(case when ${ordersTable.status} = 'SUCCESS' then ${ordersTable.amount} else 0 end), 0)`,
      todayRevenue: sql<string>`coalesce(sum(case when ${ordersTable.status} = 'SUCCESS' and ${ordersTable.paidAt} >= date_trunc('day', now()) then ${ordersTable.amount} else 0 end), 0)`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchantId));

  const r = rows[0] ?? {
    total: 0,
    success: 0,
    failed: 0,
    pending: 0,
    revenue: "0",
    todayRevenue: "0",
  };
  const total = Number(r.total ?? 0);
  const success = Number(r.success ?? 0);
  return {
    totalOrders: total,
    successCount: success,
    failedCount: Number(r.failed ?? 0),
    pendingCount: Number(r.pending ?? 0),
    totalRevenue: Number(r.revenue ?? 0),
    todayRevenue: Number(r.todayRevenue ?? 0),
    successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
  };
}

export async function dashboardTimeseriesForMerchant(
  merchantId: string,
  days: number,
) {
  await expireStaleOrders();
  const rows = await db.execute<{
    day: string;
    revenue: string;
    count: number;
  }>(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', now()) - (${days - 1} || ' days')::interval,
        date_trunc('day', now()),
        '1 day'::interval
      )::date AS day
    )
    SELECT
      to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(case when o.status = 'SUCCESS' then o.amount else 0 end), 0)::text as revenue,
      coalesce(sum(case when o.status = 'SUCCESS' then 1 else 0 end), 0)::int as count
    FROM days d
    LEFT JOIN ${ordersTable} o
      ON date_trunc('day', o.paid_at) = d.day
     AND o.merchant_id = ${merchantId}
    GROUP BY d.day
    ORDER BY d.day ASC;
  `);

  return rows.rows.map((r) => ({
    date: r.day,
    revenue: Number(r.revenue),
    count: Number(r.count),
  }));
}

export { serializeOrder, ORDER_EXPIRY_MS };
