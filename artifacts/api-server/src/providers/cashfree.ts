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
 * Cashfree provider — single PayLite Cashfree account, multiple merchants
 * onboarded as Easy Split vendors. Customer pays into Cashfree's nodal; funds
 * are split + settled to each vendor's bank on T+1.
 *
 * Real Cashfree API used when CASHFREE_APP_ID + CASHFREE_SECRET_KEY are
 * present; otherwise local sandbox stub.
 *
 * Inbound webhook signature scheme (Cashfree v3):
 *   x-webhook-signature = base64(hmac_sha256(secret, timestamp + raw_body))
 *   x-webhook-timestamp = unix epoch seconds
 */
const APP_ID = process.env["CASHFREE_APP_ID"] ?? "";
const SECRET = process.env["CASHFREE_SECRET_KEY"] ?? "";
const LIVE = Boolean(APP_ID && SECRET);
// For Cashfree API v2023-08-01, webhooks are signed with the same SecretKey.
// CASHFREE_WEBHOOK_SECRET can override this (e.g. older webhook API versions).
const WEBHOOK_SECRET =
  process.env["CASHFREE_WEBHOOK_SECRET"] ??
  (LIVE ? SECRET : null) ??
  process.env["WEBHOOK_SECRET"] ??
  "dev-webhook-secret";
const CF_BASE =
  process.env["CASHFREE_BASE"] ??
  (LIVE ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");
const CF_API_VERSION = process.env["CASHFREE_API_VERSION"] ?? "2023-08-01";
const PROVIDER_VPA = process.env["CASHFREE_VPA"] ?? "paylite.cf@cashfree";

function cfId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

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

function hmacBase64(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

function authHeaders(): Record<string, string> {
  return {
    "x-client-id": APP_ID,
    "x-client-secret": SECRET,
    "x-api-version": CF_API_VERSION,
    "content-type": "application/json",
  };
}

async function cfRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { message?: string; type?: string };
      if (j.message) detail = j.message;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(`Cashfree ${path} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** Map Cashfree's vendor status string to our enum. */
function mapVendorStatus(s: string | undefined): ProviderVendorResult["status"] {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE" || v === "VERIFIED") return "ACTIVE";
  if (v === "BLOCKED" || v === "REJECTED" || v === "DELETED") return "REJECTED";
  return "PENDING";
}

interface CfOrderCreateResponse {
  cf_order_id: string;
  order_id: string;
  payment_session_id: string;
  order_status?: string;
}

interface CfPayResponse {
  cf_payment_id?: number | string;
  payment_method?: string;
  channel?: string;
  action?: string;
  data?: {
    payload?: {
      qrcode?: string;
      bharat_qr?: string;
      default?: string;
    };
  };
}

interface CfVendorResponse {
  vendor_id?: string;
  status?: string;
  remarks?: string;
  message?: string;
}

export const cashfreeProvider: PaymentProvider = {
  name: "cashfree",
  displayName: "Cashfree",
  isAvailable: () => true,

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    const vendorId = input.merchantConfig?.providerMerchantId ?? null;
    const customerId =
      vendorId || `cust_${crypto.randomBytes(4).toString("hex")}`;

    if (LIVE) {
      if (!vendorId) {
        throw new Error(
          "Merchant has no Cashfree vendor mapping — KYC must complete first",
        );
      }

      // 1. Create the order with order_splits → 100% routed to this merchant's
      //    vendor at settlement time.
      const order = await cfRequest<CfOrderCreateResponse>("/orders", {
        method: "POST",
        body: JSON.stringify({
          order_amount: Math.round(input.amount * 100) / 100,
          order_currency: "INR",
          order_id: input.orderId,
          order_meta: { payment_methods: "upi" },
          order_splits: [{ vendor_id: vendorId, percentage: 100 }],
          customer_details: {
            customer_id: customerId,
            customer_name: input.customerName ?? input.businessName,
            customer_email: input.customerEmail ?? "noreply@paylite.in",
            customer_phone: input.customerPhone ?? "9999999999",
          },
          order_tags: {
            merchant_id: input.merchantConfig?.merchantId ?? "",
            vendor_id: vendorId,
          },
        }),
      });

      // 2. Initiate a UPI-QR-channel payment against the order. Cashfree
      //    returns the dynamic UPI intent string keyed to its nodal collection
      //    account — that's what the customer scans.
      const pay = await cfRequest<CfPayResponse>("/orders/pay", {
        method: "POST",
        body: JSON.stringify({
          payment_session_id: order.payment_session_id,
          payment_method: { upi: { channel: "qrcode" } },
        }),
      });

      const qrString =
        pay.data?.payload?.qrcode ??
        pay.data?.payload?.default ??
        pay.data?.payload?.bharat_qr ??
        null;
      if (!qrString) {
        throw new Error("Cashfree did not return a UPI QR payload");
      }
      const qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });

      return {
        // Use cf_order_id (globally unique) as txnId so reconciliation +
        // multi-merchant order id collisions are safe.
        txnId: order.cf_order_id,
        providerOrderId: order.cf_order_id,
        qrString,
        qrImage,
      };
    }

    // Sandbox stub — uses merchant VPA (or fallback) for visual fidelity. No
    // real money will move in this branch.
    const cfOrderId = cfId("cf_order");
    const sandboxVpa = input.merchantConfig?.providerVpa || PROVIDER_VPA;
    const qrString = buildUpiIntent({
      vpa: sandboxVpa,
      payeeName: input.businessName,
      amount: input.amount,
      txnRef: cfOrderId,
      note: input.orderId,
    });
    const qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });
    return {
      txnId: cfOrderId,
      providerOrderId: cfOrderId,
      qrString,
      qrImage,
    };
  },

  async fetchPaymentStatus(txnId: string): Promise<ProviderStatus> {
    if (!LIVE) return "PENDING";
    try {
      const order = await cfRequest<{ order_status?: string }>(
        `/orders/${encodeURIComponent(txnId)}`,
        { method: "GET" },
      );
      const status = order.order_status?.toUpperCase();
      if (status === "PAID") return "SUCCESS";
      if (status === "EXPIRED" || status === "TERMINATED") return "EXPIRED";
      if (status === "FAILED") return "FAILED";
      return "PENDING";
    } catch {
      return "PENDING";
    }
  },

  async refund(txnId: string, amount: number): Promise<ProviderRefundResult> {
    if (!LIVE) {
      return { ok: true, status: "SUCCESS", providerRefundId: cfId("cf_rfnd") };
    }
    try {
      const refund = await cfRequest<{ refund_id?: string; refund_status?: string }>(
        `/orders/${encodeURIComponent(txnId)}/refunds`,
        {
          method: "POST",
          body: JSON.stringify({
            refund_amount: Math.round(amount * 100) / 100,
            refund_id: cfId("rfnd"),
            refund_note: "PayLite refund",
          }),
        },
      );
      const s = (refund.refund_status ?? "").toUpperCase();
      const status: ProviderRefundResult["status"] =
        s === "SUCCESS" ? "SUCCESS" : s === "FAILED" ? "FAILED" : "INITIATED";
      return { ok: status !== "FAILED", status, providerRefundId: refund.refund_id };
    } catch (e) {
      return {
        ok: false,
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  async createVendor(input: ProviderVendorInput): Promise<ProviderVendorResult> {
    if (!LIVE) {
      // Sandbox: simulate an instantly-active vendor record so dev demos work
      // end-to-end without Cashfree credentials.
      return {
        vendorId: `sandbox_v_${crypto.randomBytes(4).toString("hex")}`,
        status: "ACTIVE",
      };
    }
    const res = await cfRequest<CfVendorResponse>("/easy-split/vendors", {
      method: "POST",
      body: JSON.stringify({
        vendor_id: `pl${input.merchantId.replace(/-/g, "")}`,
        status: "ACTIVE",
        name: input.name,
        email: input.email,
        phone: input.phone,
        verify_account: true,
        dashboard_access: false,
        bank: {
          account_number: input.bankAccountNumber,
          account_holder: input.bankAccountHolderName,
          ifsc: input.ifsc,
        },
        kyc_details: {
          account_type: "BUSINESS",
          business_type: "INDIVIDUAL",
          pan: input.pan,
        },
      }),
    });
    return {
      vendorId: res.vendor_id ?? `paylite_${input.merchantId}`,
      status: mapVendorStatus(res.status),
      reason: res.remarks ?? res.message ?? null,
    };
  },

  async getVendorStatus(vendorId: string): Promise<ProviderVendorResult> {
    if (!LIVE) return { vendorId, status: "ACTIVE" };
    const res = await cfRequest<CfVendorResponse>(
      `/easy-split/vendors/${encodeURIComponent(vendorId)}`,
      { method: "GET" },
    );
    return {
      vendorId,
      status: mapVendorStatus(res.status),
      reason: res.remarks ?? res.message ?? null,
    };
  },

  parseWebhook(rawBody, headers): ProviderWebhookPayload {
    const sig = headers["x-webhook-signature"];
    const ts = headers["x-webhook-timestamp"];
    if (!sig || !ts) throw new Error("Missing x-webhook-signature/timestamp");
    const expected = hmacBase64(WEBHOOK_SECRET, ts + rawBody.toString("utf8"));
    if (
      expected.length !== sig.length ||
      !timingSafeEqualHex(
        Buffer.from(expected).toString("hex"),
        Buffer.from(sig).toString("hex"),
      )
    ) {
      throw new Error("Invalid signature");
    }

    interface CfPayload {
      type?: string;
      data?: {
        order?: { order_id?: string; cf_order_id?: string | number };
        payment?: {
          cf_payment_id?: number;
          payment_status?: string;
          payment_method?: { upi?: unknown; card?: unknown };
        };
        dispute?: {
          dispute_id?: string;
          dispute_reason?: string;
          dispute_amount?: number;
          cf_payment_id?: string;
        };
      };
    }
    const body = JSON.parse(rawBody.toString("utf8")) as CfPayload;
    // Prefer cf_order_id (globally unique, what we store as txnId). Fall back
    // to merchant order_id for backwards compat with older webhook payloads.
    const cfOrderId = body.data?.order?.cf_order_id;
    const txnId = cfOrderId
      ? String(cfOrderId)
      : (body.data?.order?.order_id ?? "");
    if (!txnId) throw new Error("No order_id/cf_order_id in webhook");

    if (body.type === "DISPUTE_CREATED") {
      const d = body.data?.dispute;
      return {
        txnId,
        status: "SUCCESS",
        dispute: {
          reason: d?.dispute_reason ?? "unknown",
          amount: d?.dispute_amount ?? 0,
        },
      };
    }
    const ps = body.data?.payment?.payment_status?.toUpperCase();
    let status: ProviderStatus = "PENDING";
    if (ps === "SUCCESS") status = "SUCCESS";
    else if (ps === "FAILED" || ps === "USER_DROPPED") status = "FAILED";
    else if (ps === "CANCELLED") status = "EXPIRED";

    const m = body.data?.payment?.payment_method;
    const method: ProviderWebhookPayload["paymentMethod"] = m?.upi
      ? "UPI"
      : m?.card
        ? "CARD"
        : "UPI";
    return { txnId, status, paymentMethod: method };
  },
};
