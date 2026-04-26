import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/**
 * One settlement = one payout to a merchant for a settlement date (T+1 batch).
 * Aggregates all SUCCESS orders that fell on the previous day.
 */
export const settlementsTable = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    settlementDate: date("settlement_date").notNull(),
    grossPaise: integer("gross_paise").notNull(),
    feePaise: integer("fee_paise").notNull(),
    refundPaise: integer("refund_paise").notNull().default(0),
    netPaise: integer("net_paise").notNull(),
    orderCount: integer("order_count").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | PROCESSING | PAID | FAILED
    bankRef: text("bank_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("settlements_merchant_idx").on(t.merchantId),
    index("settlements_date_idx").on(t.settlementDate),
    index("settlements_status_idx").on(t.status),
  ],
);

/**
 * Double-entry ledger. Every settlement and refund creates balanced entries.
 * Account types: gateway_payable | merchant_payable | fee_income | refund_clearing
 */
export const ledgerEntriesTable = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    settlementId: uuid("settlement_id"),
    orderId: uuid("order_id"),
    account: text("account").notNull(),
    direction: text("direction").notNull(), // DEBIT | CREDIT
    amountPaise: integer("amount_paise").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ledger_merchant_idx").on(t.merchantId),
    index("ledger_settlement_idx").on(t.settlementId),
    index("ledger_account_idx").on(t.account),
  ],
);

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
