export type PaymentMethod = "UPI" | "CARD" | "NETBANKING" | "WALLET";
export type ProviderStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface ProviderOrderInput {
  orderId: string;
  amount: number;
  businessName: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  merchantConfig?: {
    merchantId: string;
    /** Decentro beneficiary_id or other provider-side vendor/sub-account id. Primary payee for QR. */
    providerMerchantId?: string | null;
    /** Provider collection/payout account or virtual payment address. */
    providerAccount?: string | null;
    providerStoreId?: string | null;
    providerTerminalId?: string | null;
    providerReference?: string | null;
    /** Merchant's UPI VPA — used as fallback payee and for beneficiary registration. */
    providerVpa?: string | null;
  };
}

export interface ProviderVendorInput {
  merchantId: string;
  name: string;
  email: string;
  phone: string;
  pan: string;
  bankAccountNumber: string;
  bankAccountHolderName: string;
  ifsc: string;
  /** Merchant's UPI VPA — used for beneficiary registration if provided. */
  vpa?: string | null;
}

export interface ProviderVendorResult {
  vendorId: string;
  /** PENDING | ACTIVE | REJECTED */
  status: "PENDING" | "ACTIVE" | "REJECTED";
  reason?: string | null;
}

export interface ProviderOrderResult {
  txnId: string;
  providerOrderId: string;
  qrString?: string | null;
  qrImage?: string | null;
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
  dispute?: { reason: string; amount: number };
}

export interface PaymentProvider {
  readonly name: string;
  readonly displayName: string;
  isAvailable(): boolean;
  createQR(input: ProviderOrderInput): Promise<ProviderOrderResult>;
  fetchPaymentStatus(txnId: string): Promise<ProviderStatus>;
  refund(txnId: string, amount: number): Promise<ProviderRefundResult>;
  parseWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ProviderWebhookPayload;
  createVendor?(input: ProviderVendorInput): Promise<ProviderVendorResult>;
  getVendorStatus?(vendorId: string): Promise<ProviderVendorResult>;
}
