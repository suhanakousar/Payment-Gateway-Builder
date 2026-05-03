import crypto from "node:crypto";
import QRCode from "qrcode";
import { timingSafeEqualHex } from "../utils/crypto";
import type {
  PaymentProvider,
  ProviderOrderInput,
  ProviderOrderResult,
  ProviderRefundResult,
  ProviderStatus,
  ProviderVendorInput,
  ProviderVendorResult,
  ProviderWebhookPayload,
} from "./types";

/**
 * Decentro provider — UPI collection via Decentro's payment API.
 *
 * Real API used when DECENTRO_CLIENT_ID + DECENTRO_CLIENT_SECRET +
 * DECENTRO_MODULE_SECRET are present; otherwise local sandbox stub.
 *
 * Multi-merchant routing: uses Decentro virtual accounts
 * (POST /v2/banking/account/virtual). If virtual accounts are not enabled
 * on your Decentro subscription, falls back to the platform's single
 * collection account (DECENTRO_PAYEE_ACCOUNT); all settlements are then
 * handled manually from the Decentro dashboard.
 *
 * Webhook signature: HMAC-SHA256 of raw body with DECENTRO_MODULE_SECRET,
 * hex-encoded in the `x-decentro-signature` header.
 */

const CLIENT_ID = process.env["DECENTRO_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["DECENTRO_CLIENT_SECRET"] ?? "";
const MODULE_SECRET = process.env["DECENTRO_MODULE_SECRET"] ?? "";
const PROVIDER_SECRET = process.env["DECENTRO_PROVIDER_SECRET"] ?? "";
const LIVE = Boolean(CLIENT_ID && CLIENT_SECRET && MODULE_SECRET);
const DC_BASE =
  process.env["DECENTRO_BASE"] ?? "https://in.decentro.tech";
const PAYEE_ACCOUNT = process.env["DECENTRO_PAYEE_ACCOUNT"] ?? "";
const WEBHOOK_SECRET =
  process.env["DECENTRO_WEBHOOK_SECRET"] ??
  (LIVE ? MODULE_SECRET : null) ??
  "dev-webhook-secret";

function buildUpiIntent(input: {
  vpa: string;
  payeeName: string;
  amount: number;
  txnRef: string;
  note: string;
}): string {
  return `upi://pay?${new URLSearchParams({
    pa: input.vpa,
    pn: input.payeeName,
    am: input.amount.toFixed(2),
    cu: "INR",
    tn: input.note,
    tr: input.txnRef,
  }).toString()}`;
}

function authHeaders(): Record<string, string> {
  return {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    module_secret: MODULE_SECRET,
    ...(PROVIDER_SECRET ? { provider_secret: PROVIDER_SECRET } : {}),
    "Content-Type": "application/json",
  };
}

async function dcRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${DC_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      detail = j.message ?? j.error ?? text;
    } catch {
      // not JSON
    }
    throw new Error(`Decentro ${path} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function mapDcStatus(s: string | undefined): ProviderStatus {
  const v = (s ?? "").toUpperCase();
  if (v === "SUCCESS" || v === "COMPLETED") return "SUCCESS";
  if (v === "FAILURE" || v === "FAILED" || v === "ERROR") return "FAILED";
  if (v === "EXPIRED" || v === "CANCELLED") return "EXPIRED";
  return "PENDING";
}

interface DcUpiLinkResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
  data?: {
    transactionId?: string;
    link?: string;
    qrCode?: string;
    generatedLink?: string;
  };
}

interface DcTxnStatusResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
  data?: {
    transactionStatus?: string;
    amount?: number;
    utrNumber?: string;
    payerVpa?: string;
    paymentTime?: string;
  };
}

interface DcVirtualAccountResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
  data?: {
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    upiId?: string;
  };
}

interface DcRefundResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
}

export const decentroProvider: PaymentProvider = {
  name: "decentro",
  displayName: "Decentro",
  isAvailable: () => true,

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    const payeeAccount =
      input.merchantConfig?.providerVpa ??
      input.merchantConfig?.providerAccount ??
      input.merchantConfig?.providerMerchantId ??
      PAYEE_ACCOUNT;

    if (LIVE) {
      if (!payeeAccount) {
        throw new Error(
          "No payee account configured — set DECENTRO_PAYEE_ACCOUNT or complete merchant vendor registration",
        );
      }

      const refId = `pl${input.orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}`;
      const res = await dcRequest<DcUpiLinkResponse>("/v2/payments/upi/link", {
        method: "POST",
        body: JSON.stringify({
          reference_id: refId,
          payee_account: payeeAccount,
          amount: Math.round(input.amount * 100) / 100,
          purpose_message: `Payment to ${input.businessName}`.slice(0, 50),
          generate_qr: 1,
          send_sms: 0,
          send_email: 0,
          expiry_time: 30,
        }),
      });

      if (res.status !== "SUCCESS" || !res.data) {
        throw new Error(
          `Decentro UPI link failed: ${res.message ?? res.status ?? "unknown error"}`,
        );
      }

      const txnId =
        res.decentroTxnId ?? res.data.transactionId ?? refId;
      const qrString = res.data.link ?? res.data.generatedLink ?? null;
      let qrImage: string | null = null;

      if (res.data.qrCode) {
        qrImage = res.data.qrCode.startsWith("data:")
          ? res.data.qrCode
          : `data:image/png;base64,${res.data.qrCode}`;
      } else if (qrString) {
        qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });
      }

      if (!qrString && !qrImage) {
        throw new Error("Decentro did not return a UPI QR payload");
      }

      return {
        txnId,
        providerOrderId: txnId,
        qrString: qrString ?? undefined,
        qrImage,
      };
    }

    // Sandbox stub — builds a local UPI intent for visual fidelity.
    const sandboxVpa =
      input.merchantConfig?.providerVpa ||
      input.merchantConfig?.providerAccount ||
      payeeAccount ||
      "paylite@decentro";
    const txnId = `dc_${crypto.randomBytes(8).toString("hex")}`;
    const qrString = buildUpiIntent({
      vpa: sandboxVpa,
      payeeName: input.businessName,
      amount: input.amount,
      txnRef: txnId,
      note: input.orderId,
    });
    const qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });
    return { txnId, providerOrderId: txnId, qrString, qrImage };
  },

  async fetchPaymentStatus(txnId: string): Promise<ProviderStatus> {
    if (!LIVE) return "PENDING";
    try {
      const res = await dcRequest<DcTxnStatusResponse>(
        `/v2/payments/transaction/${encodeURIComponent(txnId)}`,
        { method: "GET" },
      );
      return mapDcStatus(res.data?.transactionStatus ?? res.status);
    } catch {
      return "PENDING";
    }
  },

  async refund(txnId: string, amount: number): Promise<ProviderRefundResult> {
    if (!LIVE) {
      return {
        ok: true,
        status: "SUCCESS",
        providerRefundId: `dc_rfnd_${crypto.randomBytes(4).toString("hex")}`,
      };
    }
    try {
      const res = await dcRequest<DcRefundResponse>("/v2/payments/upi/refund", {
        method: "POST",
        body: JSON.stringify({
          reference_id: `rfnd${txnId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}${crypto
            .randomBytes(4)
            .toString("hex")}`,
          transaction_id: txnId,
          refund_amount: Math.round(amount * 100) / 100,
        }),
      });
      const ok = res.status === "SUCCESS";
      return {
        ok,
        status: ok ? "SUCCESS" : "FAILED",
        providerRefundId: res.decentroTxnId,
        error: ok ? undefined : (res.message ?? "Refund failed"),
      };
    } catch (e) {
      return {
        ok: false,
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  parseWebhook(rawBody, headers): ProviderWebhookPayload {
    const sig =
      headers["x-decentro-signature"] ?? headers["x-webhook-signature"];

    if (sig && WEBHOOK_SECRET) {
      const expected = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
      if (!timingSafeEqualHex(expected, sig.toLowerCase())) {
        throw new Error("Invalid Decentro webhook signature");
      }
    }

    interface DcWebhookPayload {
      decentroTxnId?: string;
      bankReferenceNumber?: string;
      transactionStatus?: string;
      status?: string;
      paymentInstrumentType?: string;
      payerVpa?: string;
      amount?: number;
      collection?: {
        referenceId?: string;
        transactionId?: string;
        status?: string;
        transactionStatus?: string;
        amount?: number;
        payerVpa?: string;
      };
      data?: {
        decentroTxnId?: string;
        transactionStatus?: string;
        status?: string;
        amount?: number;
      };
    }

    const body = JSON.parse(rawBody.toString("utf8")) as DcWebhookPayload;
    const txnId =
      body.decentroTxnId ??
      body.collection?.transactionId ??
      body.data?.decentroTxnId ??
      body.bankReferenceNumber ??
      "";
    if (!txnId) throw new Error("No transaction ID in Decentro webhook");

    const rawStatus =
      body.transactionStatus ??
      body.collection?.transactionStatus ??
      body.collection?.status ??
      body.data?.transactionStatus ??
      body.data?.status ??
      body.status ??
      "";
    const status = mapDcStatus(rawStatus);

    const instrument = (body.paymentInstrumentType ?? "").toUpperCase();
    const method: ProviderWebhookPayload["paymentMethod"] =
      instrument.includes("CARD") ? "CARD" : "UPI";

    return { txnId, status, paymentMethod: method };
  },

  /**
   * Creates a virtual account per merchant for automatic fund routing.
   * Falls back to DECENTRO_PAYEE_ACCOUNT if virtual accounts are not
   * enabled on the Decentro subscription.
   */
  async createVendor(input: ProviderVendorInput): Promise<ProviderVendorResult> {
    if (!LIVE) {
      return {
        vendorId: PAYEE_ACCOUNT || `dc_sandbox_${input.merchantId.replace(/-/g, "").slice(0, 12)}`,
        status: "ACTIVE",
      };
    }

    try {
      const refId = `plva${input.merchantId.replace(/-/g, "").slice(0, 20)}`;
      const res = await dcRequest<DcVirtualAccountResponse>(
        "/v2/banking/account/virtual",
        {
          method: "POST",
          body: JSON.stringify({
            reference_id: refId,
            name: input.name,
            mobile: input.phone
              .replace(/^\+91/, "")
              .replace(/\D/g, "")
              .slice(0, 10),
            email: input.email,
            ifsc: input.ifsc,
            account_number: input.bankAccountNumber,
          }),
        },
      );

      if (res.status === "SUCCESS" && res.data?.accountNumber) {
        const vendorId =
          res.data.upiId ??
          `${res.data.accountNumber}@${(res.data.ifsc ?? "").toLowerCase()}`;
        return { vendorId, status: "ACTIVE" };
      }

      // Virtual accounts not enabled — fall back to platform collection account.
      if (PAYEE_ACCOUNT) {
        return { vendorId: PAYEE_ACCOUNT, status: "ACTIVE" };
      }

      return {
        vendorId: refId,
        status: "PENDING",
        reason: res.message ?? "Virtual account pending verification",
      };
    } catch {
      // API not enabled on subscription — fall back to platform account.
      if (PAYEE_ACCOUNT) {
        return { vendorId: PAYEE_ACCOUNT, status: "ACTIVE" };
      }
      throw new Error(
        "Decentro virtual account creation failed and no DECENTRO_PAYEE_ACCOUNT fallback is configured",
      );
    }
  },

  async getVendorStatus(vendorId: string): Promise<ProviderVendorResult> {
    // Virtual accounts are immediately active once created.
    return { vendorId, status: "ACTIVE" };
  },
};
