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
 * LIVE mode: requires DECENTRO_CLIENT_ID + DECENTRO_CLIENT_SECRET +
 * DECENTRO_MODULE_SECRET in environment.
 *
 * Payment flow (LIVE):
 *  1. On merchant KYC approval → createVendor() registers merchant as a
 *     Decentro beneficiary (bank account + IFSC, or UPI VPA).
 *     The returned beneficiary_id is stored in merchant.providerMerchantId.
 *  2. On order create → createQR() sends merchant's beneficiary_id as the
 *     payee_account in the Decentro UPI link request. Decentro validates the
 *     payee and returns a real UPI intent/QR the customer can scan.
 *  3. Customer pays → Decentro fires webhook → order marked SUCCESS.
 *
 * SANDBOX mode (no API keys): local UPI intent is built with the merchant's
 * saved providerVpa. Use the "Demo controls" on the payment page to simulate
 * payment completion.
 */

const CLIENT_ID = process.env["DECENTRO_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["DECENTRO_CLIENT_SECRET"] ?? "";
const MODULE_SECRET = process.env["DECENTRO_MODULE_SECRET"] ?? "";
const PROVIDER_SECRET = process.env["DECENTRO_PROVIDER_SECRET"] ?? "";
const LIVE = Boolean(CLIENT_ID && CLIENT_SECRET && MODULE_SECRET);
const DC_BASE = process.env["DECENTRO_BASE"] ?? "https://in.decentro.tech";
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
    throw new Error(`Decentro ${path} ${res.status}: ${detail.slice(0, 300)}`);
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

// ─── Decentro API response shapes ────────────────────────────────────────────

interface DcBeneficiaryResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
  data?: {
    beneficiaryId?: string;
    beneficiary_id?: string;
    status?: string;
  };
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
    upiLink?: string;
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

interface DcRefundResponse {
  decentroTxnId?: string;
  status?: string;
  responseCode?: string;
  message?: string;
}

// ─── Provider implementation ─────────────────────────────────────────────────

export const decentroProvider: PaymentProvider = {
  name: "decentro",
  displayName: "Decentro",
  isAvailable: () => true,

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    // beneficiary_id is stored in providerMerchantId after registration.
    // Fallback chain: beneficiary_id → providerVpa → PAYEE_ACCOUNT.
    const beneficiaryId = input.merchantConfig?.providerMerchantId ?? null;
    const payeeVpa = input.merchantConfig?.providerVpa ?? null;
    const payeeAccount = beneficiaryId ?? payeeVpa ?? PAYEE_ACCOUNT;

    if (LIVE) {
      if (!payeeAccount) {
        throw new Error(
          "No payee configured — save your UPI ID in KYC → Provider mapping and ensure it is registered as a Decentro beneficiary.",
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

      const txnId = res.decentroTxnId ?? res.data.transactionId ?? refId;
      const qrString =
        res.data.upiLink ?? res.data.link ?? res.data.generatedLink ?? null;
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

    // ── Sandbox stub ──────────────────────────────────────────────────────────
    // Use merchant's real UPI VPA so the QR can be tested manually.
    // If no VPA is saved, fall back to a placeholder (use Demo controls to mark paid).
    const sandboxVpa = payeeVpa || payeeAccount || "sandbox@decentro";
    const txnId = `dc_${crypto.randomBytes(8).toString("hex")}`;
    const qrString = buildUpiIntent({
      vpa: sandboxVpa,
      payeeName: input.businessName,
      amount: input.amount,
      txnRef: txnId,
      note: input.orderId,
    });
    const qrImage = await QRCode.toDataURL(qrString, {
      width: 320,
      margin: 1,
    });
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
      const res = await dcRequest<DcRefundResponse>(
        "/v2/payments/upi/refund",
        {
          method: "POST",
          body: JSON.stringify({
            reference_id: `rfnd${txnId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}${crypto
              .randomBytes(4)
              .toString("hex")}`,
            transaction_id: txnId,
            refund_amount: Math.round(amount * 100) / 100,
          }),
        },
      );
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
   * Register merchant as a Decentro beneficiary.
   *
   * Tries two strategies in order:
   *  1. Bank account + IFSC beneficiary (preferred — allows Decentro to route
   *     settlement directly to the merchant's bank account).
   *  2. UPI VPA beneficiary (simpler, works for merchants who only have a VPA).
   *
   * The returned beneficiary_id is stored in merchant.providerMerchantId and
   * used as the payee_account for all subsequent QR/collect requests.
   */
  async createVendor(
    input: ProviderVendorInput,
  ): Promise<ProviderVendorResult> {
    if (!LIVE) {
      // In sandbox, use the merchant's VPA as a pseudo beneficiary_id so QRs
      // show the right payee name and address.
      const sandboxId =
        input.vpa ||
        PAYEE_ACCOUNT ||
        `sandbox_${input.merchantId.replace(/-/g, "").slice(0, 12)}`;
      return { vendorId: sandboxId, status: "ACTIVE" };
    }

    const refId = `plben${input.merchantId.replace(/-/g, "").slice(0, 19)}`;

    // ── Strategy 1: bank account beneficiary ─────────────────────────────────
    try {
      const res = await dcRequest<DcBeneficiaryResponse>(
        "/v2/core_banking/beneficiary",
        {
          method: "POST",
          body: JSON.stringify({
            reference_id: refId,
            beneficiary_name: input.name,
            beneficiary_account_number: input.bankAccountNumber,
            beneficiary_ifsc: input.ifsc,
            beneficiary_email: input.email,
            beneficiary_mobile: input.phone
              .replace(/^\+91/, "")
              .replace(/\D/g, "")
              .slice(0, 10),
            beneficiary_type: "VENDOR",
          }),
        },
      );

      if (res.status === "SUCCESS") {
        const beneficiaryId =
          res.data?.beneficiaryId ??
          res.data?.beneficiary_id ??
          res.decentroTxnId ??
          refId;
        return { vendorId: beneficiaryId, status: "ACTIVE" };
      }
    } catch {
      // Strategy 1 failed — try VPA beneficiary next.
    }

    // ── Strategy 2: UPI VPA beneficiary ──────────────────────────────────────
    if (input.vpa) {
      try {
        const vpaRefId = `plvpa${input.merchantId.replace(/-/g, "").slice(0, 19)}`;
        const res = await dcRequest<DcBeneficiaryResponse>(
          "/v2/core_banking/beneficiary",
          {
            method: "POST",
            body: JSON.stringify({
              reference_id: vpaRefId,
              beneficiary_name: input.name,
              beneficiary_vpa: input.vpa,
              beneficiary_email: input.email,
              beneficiary_mobile: input.phone
                .replace(/^\+91/, "")
                .replace(/\D/g, "")
                .slice(0, 10),
              beneficiary_type: "VENDOR",
            }),
          },
        );

        if (res.status === "SUCCESS") {
          const beneficiaryId =
            res.data?.beneficiaryId ??
            res.data?.beneficiary_id ??
            res.decentroTxnId ??
            vpaRefId;
          return { vendorId: beneficiaryId, status: "ACTIVE" };
        }

        // Decentro returned non-SUCCESS — pending review.
        return {
          vendorId: vpaRefId,
          status: "PENDING",
          reason: res.message ?? "Beneficiary registration pending verification",
        };
      } catch (e) {
        // VPA strategy also failed.
        if (PAYEE_ACCOUNT) {
          return { vendorId: PAYEE_ACCOUNT, status: "ACTIVE" };
        }
        throw new Error(
          `Decentro beneficiary registration failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ── Final fallback ────────────────────────────────────────────────────────
    if (PAYEE_ACCOUNT) {
      return { vendorId: PAYEE_ACCOUNT, status: "ACTIVE" };
    }

    throw new Error(
      "Decentro beneficiary registration failed — set DECENTRO_PAYEE_ACCOUNT as a fallback or provide merchant UPI VPA",
    );
  },

  async getVendorStatus(vendorId: string): Promise<ProviderVendorResult> {
    // Decentro beneficiaries are either immediately active or manually reviewed.
    // We return ACTIVE unless the ID looks like a pending stub.
    if (vendorId.startsWith("plben") || vendorId.startsWith("plvpa")) {
      // Try to poll status — if not supported, assume ACTIVE.
      try {
        const res = await dcRequest<DcBeneficiaryResponse>(
          `/v2/core_banking/beneficiary/${encodeURIComponent(vendorId)}`,
          { method: "GET" },
        );
        if (res.status === "SUCCESS") {
          return {
            vendorId,
            status: (res.data?.status ?? "ACTIVE") === "ACTIVE" ? "ACTIVE" : "PENDING",
          };
        }
      } catch {
        // Endpoint may not exist — treat as ACTIVE.
      }
    }
    return { vendorId, status: "ACTIVE" };
  },
};
