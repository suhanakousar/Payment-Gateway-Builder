import * as ordersRepo from "../repositories/orders";

const DUP_AMOUNT_THRESHOLD = 5;
const DUP_AMOUNT_WINDOW_MS = 60_000; // 1 minute
const HIGH_VOLUME_THRESHOLD = 30;
const HIGH_VOLUME_WINDOW_MS = 60_000;
const HIGH_AMOUNT = 200_000; // ₹2,00,000

export interface FraudResult {
  flag: boolean;
  reason: string | null;
}

export async function evaluate(opts: {
  merchantId: string;
  amount: number;
}): Promise<FraudResult> {
  const reasons: string[] = [];

  if (opts.amount >= HIGH_AMOUNT) {
    reasons.push(`Amount above threshold (₹${HIGH_AMOUNT.toLocaleString("en-IN")})`);
  }

  const dupCount = await ordersRepo.countDuplicateAmount({
    merchantId: opts.merchantId,
    amount: opts.amount.toFixed(2),
    withinMs: DUP_AMOUNT_WINDOW_MS,
  });
  if (dupCount >= DUP_AMOUNT_THRESHOLD) {
    reasons.push(
      `Repeated amount (${dupCount + 1} orders for ₹${opts.amount} in last 60s)`,
    );
  }

  const recentTotal = await ordersRepo.countRecentForMerchant({
    merchantId: opts.merchantId,
    withinMs: HIGH_VOLUME_WINDOW_MS,
  });
  if (recentTotal >= HIGH_VOLUME_THRESHOLD) {
    reasons.push(`Burst volume (${recentTotal + 1} orders in last 60s)`);
  }

  return reasons.length > 0
    ? { flag: true, reason: reasons.join("; ") }
    : { flag: false, reason: null };
}
