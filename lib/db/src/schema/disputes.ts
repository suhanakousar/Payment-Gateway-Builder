import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { ordersTable } from "./orders";

/**
 * Dispute / chargeback raised by the cardholder via the issuing bank.
 * Workflow: OPEN -> UNDER_REVIEW (after evidence) -> WON | LOST
 */
export const disputesTable = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    providerDisputeId: text("provider_dispute_id"),
    reason: text("reason").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    status: text("status").notNull().default("OPEN"),
    evidenceText: text("evidence_text"),
    evidenceUrl: text("evidence_url"),
    resolutionNote: text("resolution_note"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("disputes_merchant_idx").on(t.merchantId),
    index("disputes_order_idx").on(t.orderId),
    index("disputes_status_idx").on(t.status),
  ],
);

export const insertDisputeSchema = createInsertSchema(disputesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputesTable.$inferSelect;
