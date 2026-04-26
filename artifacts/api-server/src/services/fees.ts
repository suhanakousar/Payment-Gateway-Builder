/**
 * Aggregator pricing. PayLite charges 2% + ₹2 GST per successful order. All
 * downstream accounting (settlements, ledger) reads from this single source.
 *
 * Returns the fee in PAISE (so we never lose subrupee precision).
 */
const PERCENT = 0.02;
const FLAT_GST_PAISE = 200; // ₹2

export function calculateFeePaise(amountInRupees: number): number {
  const amountPaise = Math.round(amountInRupees * 100);
  const pct = Math.round(amountPaise * PERCENT);
  return pct + FLAT_GST_PAISE;
}

export const FEE_DESCRIPTION = "2% + ₹2 (incl. GST)";
