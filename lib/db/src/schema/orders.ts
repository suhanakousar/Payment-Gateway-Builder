import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const ordersTable = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    txnId: text("txn_id"),
    provider: text("provider").notNull().default("mock"),
    providerOrderId: text("provider_order_id"),
    paymentMethod: text("payment_method"), // UPI | CARD | NETBANKING | WALLET
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    feePaise: integer("fee_paise").notNull().default(0),
    status: text("status").notNull().default("PENDING"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    note: text("note"),
    qrString: text("qr_string"),
    fraudFlag: boolean("fraud_flag").notNull().default(false),
    fraudReason: text("fraud_reason"),
    refundStatus: text("refund_status"),
    refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    settlementId: uuid("settlement_id"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_txn_id_unique").on(t.txnId),
    uniqueIndex("orders_merchant_orderid_unique").on(t.merchantId, t.orderId),
    index("orders_merchant_idx").on(t.merchantId),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    index("orders_settlement_idx").on(t.settlementId),
    index("orders_provider_idx").on(t.provider),
  ],
);

export const webhookEventsTable = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txnId: text("txn_id").notNull(),
    status: text("status").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_txn_unique").on(t.txnId)],
);

export const merchantWebhooksTable = pgTable(
  "merchant_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    webhookUrl: text("webhook_url").notNull(),
    webhookSecret: text("webhook_secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("merchant_webhooks_merchant_idx").on(t.merchantId)],
);

export const webhookLogsTable = pgTable(
  "webhook_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    merchantWebhookId: uuid("merchant_webhook_id").references(
      () => merchantWebhooksTable.id,
      { onDelete: "set null" },
    ),
    event: text("event"),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").notNull(), // SENT | FAILED | RETRY
    requestBody: text("request_body"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("webhook_logs_order_idx").on(t.orderId),
    index("webhook_logs_created_idx").on(t.createdAt),
  ],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
export type MerchantWebhook = typeof merchantWebhooksTable.$inferSelect;
export type WebhookLog = typeof webhookLogsTable.$inferSelect;
