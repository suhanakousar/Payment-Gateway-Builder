import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchantsTable = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name").notNull(),
  preferredProvider: text("preferred_provider").notNull().default("cashfree"),
  providerMerchantId: text("provider_merchant_id"),
  providerStoreId: text("provider_store_id"),
  providerTerminalId: text("provider_terminal_id"),
  providerReference: text("provider_reference"),
  providerVpa: text("provider_vpa"),
  providerStatus: text("provider_status").notNull().default("PENDING"),
  pan: text("pan"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  // KYC workflow: NOT_STARTED -> SUBMITTED -> UNDER_REVIEW -> APPROVED | REJECTED
  kycStatus: text("kyc_status").notNull().default("NOT_STARTED"),
  kycSubmittedAt: timestamp("kyc_submitted_at", { withTimezone: true }),
  kycReviewedAt: timestamp("kyc_reviewed_at", { withTimezone: true }),
  kycRejectionReason: text("kyc_rejection_reason"),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchantsTable.$inferSelect;
