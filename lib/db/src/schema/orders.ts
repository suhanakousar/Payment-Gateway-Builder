import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
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
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    status: text("status").notNull().default("PENDING"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    note: text("note"),
    qrString: text("qr_string"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_txn_id_unique").on(t.txnId),
    index("orders_merchant_idx").on(t.merchantId),
    index("orders_status_idx").on(t.status),
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

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
