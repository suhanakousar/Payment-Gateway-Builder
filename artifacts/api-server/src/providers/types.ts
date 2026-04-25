/**
 * Generic payment-provider adapter. Real providers (Decentro, Pinelabs, Razorpay)
 * implement the same interface so the rest of the app stays provider-agnostic.
 */
export interface ProviderOrderInput {
  orderId: string;
  amount: number;
  businessName: string;
}

export interface ProviderOrderResult {
  txnId: string;
  qrString: string;
  qrImage: string; // data URL PNG
}

export type ProviderStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface ProviderRefundResult {
  ok: boolean;
  status: "INITIATED" | "SUCCESS" | "FAILED";
}

export interface PaymentProvider {
  readonly name: string;
  createQR(input: ProviderOrderInput): Promise<ProviderOrderResult>;
  fetchPaymentStatus(txnId: string): Promise<ProviderStatus>;
  refund(txnId: string, amount: number): Promise<ProviderRefundResult>;
}
