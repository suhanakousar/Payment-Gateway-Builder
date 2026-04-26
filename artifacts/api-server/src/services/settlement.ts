import crypto from "node:crypto";
import * as settlementsRepo from "../repositories/settlements";
import * as merchantsRepo from "../repositories/merchants";
import { calculateFeePaise } from "./fees";
import type { LedgerEntry, Settlement } from "@workspace/db";

export interface SettlementPublic {
  id: string;
  settlementDate: string;
  grossPaise: number;
  feePaise: number;
  refundPaise: number;
  netPaise: number;
  orderCount: number;
  status: string;
  bankRef: string | null;
  paidAt: string | null;
  createdAt: string;
}

export function toPublic(s: Settlement): SettlementPublic {
  return {
    id: s.id,
    settlementDate: s.settlementDate,
    grossPaise: s.grossPaise,
    feePaise: s.feePaise,
    refundPaise: s.refundPaise,
    netPaise: s.netPaise,
    orderCount: s.orderCount,
    status: s.status,
    bankRef: s.bankRef,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function listForMerchant(
  merchantId: string,
): Promise<SettlementPublic[]> {
  const rows = await settlementsRepo.listForMerchant(merchantId);
  return rows.map(toPublic);
}

/**
 * Run the T+1 settlement for a single ISO date string (YYYY-MM-DD).
 * Groups all unsettled SUCCESS orders whose paidAt fell on that day per
 * merchant, creates one settlement + double-entry ledger entries.
 *
 *   debit  gateway_payable      gross
 *   credit fee_income           fee
 *   credit merchant_payable     net
 *
 * Idempotent: if a merchant already has a settlement for this date with
 * matching orders, no new rows are created (we mark orders as we go).
 */
export async function runSettlementForDate(
  dateKey: string,
): Promise<{ settled: number; merchants: number }> {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const merchantIds = await settlementsRepo.merchantsWithUnsettledForRange({
    start,
    end,
  });

  let created = 0;
  for (const merchantId of merchantIds) {
    const orders = await settlementsRepo.findUnsettledOrders({
      merchantId,
      start,
      end,
    });
    if (orders.length === 0) continue;

    let grossPaise = 0;
    let feePaise = 0;
    let refundPaise = 0;
    for (const o of orders) {
      const amountPaise = Math.round(Number(o.amount) * 100);
      const fee = o.feePaise || calculateFeePaise(Number(o.amount));
      grossPaise += amountPaise;
      feePaise += fee;
      if (o.refundStatus === "SUCCESS" && o.refundAmount) {
        refundPaise += Math.round(Number(o.refundAmount) * 100);
      }
    }
    const netPaise = grossPaise - feePaise - refundPaise;

    const ledger: Omit<LedgerEntry, "id" | "createdAt" | "settlementId">[] = [
      {
        merchantId,
        orderId: null,
        account: "gateway_payable",
        direction: "DEBIT",
        amountPaise: grossPaise,
        description: `Settlement gross — ${dateKey}`,
      },
      {
        merchantId,
        orderId: null,
        account: "fee_income",
        direction: "CREDIT",
        amountPaise: feePaise,
        description: `Aggregator fee — ${dateKey}`,
      },
    ];
    if (refundPaise > 0) {
      ledger.push({
        merchantId,
        orderId: null,
        account: "refund_clearing",
        direction: "CREDIT",
        amountPaise: refundPaise,
        description: `Refund offset — ${dateKey}`,
      });
    }
    ledger.push({
      merchantId,
      orderId: null,
      account: "merchant_payable",
      direction: "CREDIT",
      amountPaise: netPaise,
      description: `Payout to merchant — ${dateKey}`,
    });

    await settlementsRepo.createSettlementWithOrders({
      write: {
        merchantId,
        settlementDate: dateKey,
        grossPaise,
        feePaise,
        refundPaise,
        netPaise,
        orderCount: orders.length,
      },
      orderIds: orders.map((o) => o.id),
      ledgerEntries: ledger,
    });
    created++;
  }

  return { settled: created, merchants: merchantIds.length };
}

export async function markPaid(opts: {
  id: string;
}): Promise<SettlementPublic | null> {
  const bankRef = `UTR${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const updated = await settlementsRepo.markPaid({ id: opts.id, bankRef });
  return updated ? toPublic(updated) : null;
}

export async function ledgerForMerchant(merchantId: string) {
  const rows = await settlementsRepo.ledgerForMerchant(merchantId);
  return rows.map((e) => ({
    id: e.id,
    settlementId: e.settlementId,
    account: e.account,
    direction: e.direction,
    amountPaise: e.amountPaise,
    description: e.description,
    createdAt: e.createdAt.toISOString(),
  }));
}

