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
  /** Customer phone (E.164 or 10-digit Indian) — required by Cashfree's order create. */
  customerPhone?: string | null;
  merchantConfig?: {
    merchantId: string;
    /** Provider-side vendor/sub-account id (e.g. Cashfree Easy Split vendor_id, Razorpay acc_xxx). */
    providerMerchantId?: string | null;
    /** Provider collection/payout account or virtual payment address. */
    providerAccount?: string | null;
    providerStoreId?: string | null;
    providerTerminalId?: string | null;
    providerReference?: string | null;
    providerVpa?: string | null;
  };
}

/** Bank + KYC fields needed to register a merchant as a vendor on the provider side. */
export interface ProviderVendorInput {
  merchantId: string;
  name: string;
  email: string;
  phone: string;
  pan: string;
  bankAccountNumber: string;
  bankAccountHolderName: string;
  ifsc: string;
}

export interface ProviderVendorResult {
  vendorId: string;
  /** PENDING | ACTIVE | REJECTED — provider-side verification state. */
  status: "PENDING" | "ACTIVE" | "REJECTED";
  reason?: string | null;
}

export interface ProviderOrderResult {
  txnId: string;
  providerOrderId: string;
  qrString?: string | null;
  qrImage?: string | null; // data URL PNG
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
  /**
   * Optional: register a merchant as a vendor / sub-account on the provider so
   * funds can be auto-split + settled to that merchant's bank. Providers that
   * don't support sub-accounts (e.g. mock) leave this undefined.
   */
  createVendor?(input: ProviderVendorInput): Promise<ProviderVendorResult>;
  /** Optional: poll the provider for the vendor's current verification state. */
  getVendorStatus?(vendorId: string): Promise<ProviderVendorResult>;
}
