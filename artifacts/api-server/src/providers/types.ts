/**
 * Generic payment-provider adapter. Every real provider (Razorpay, Cashfree,
 * Decentro, Pinelabs, …) implements this same surface so the rest of the app
 * stays provider-agnostic. Adapter is responsible for:
 *  - calling the provider API to create an order/QR
 *  - mapping provider statuses back to our enum
 *  - issuing refunds
 *  - parsing & verifying inbound provider webhooks
 */

export type PaymentMethod = "UPI" | "CARD" | "NETBANKING" | "WALLET";
export type ProviderStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface ProviderOrderInput {
  orderId: string;
  amount: number;
  businessName: string;
  customerName?: string | null;
  customerEmail?: string | null;
}

export interface ProviderOrderResult {
  txnId: string;
  providerOrderId: string;
  qrString: string;
  qrImage: string; // data URL PNG
  /** Hosted checkout URL for non-UPI payment options. Optional. */
  checkoutUrl?: string;
}

export interface ProviderRefundResult {
  ok: boolean;
  status: "INITIATED" | "SUCCESS" | "FAILED";
  providerRefundId?: string;
  error?: string;
}

export interface ProviderWebhookPayload {
  txnId: string;
  status: ProviderStatus;
  paymentMethod?: PaymentMethod;
  /** True if this provider also signals a dispute. */
  dispute?: { reason: string; amount: number };
}

export interface PaymentProvider {
  readonly name: string;
  readonly displayName: string;
  /** Whether the provider can currently accept new orders. */
  isAvailable(): boolean;
  createQR(input: ProviderOrderInput): Promise<ProviderOrderResult>;
  fetchPaymentStatus(txnId: string): Promise<ProviderStatus>;
  refund(txnId: string, amount: number): Promise<ProviderRefundResult>;
  /**
   * Verify the HMAC signature on an inbound webhook.
   * Returns parsed payload, or throws on bad signature / bad payload.
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ProviderWebhookPayload;
}
