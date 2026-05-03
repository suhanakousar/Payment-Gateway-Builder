import type { Request, Response } from "express";
import {
  SignupBody,
  LoginBody,
} from "@workspace/api-zod";
import { z } from "zod";

const UpdateKycBody = z.object({
  pan: z
    .string()
    .trim()
    .min(5, "PAN looks too short")
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, "Use letters and digits only"),
  bankAccount: z
    .string()
    .trim()
    .min(6, "Account number too short")
    .max(20)
    .regex(/^\d+$/, "Digits only"),
  bankAccountHolderName: z
    .string()
    .trim()
    .min(2, "Holder name required")
    .max(120),
  ifsc: z
    .string()
    .trim()
    .min(6, "IFSC too short")
    .max(15)
    .regex(/^[A-Za-z0-9]+$/, "IFSC must be letters and digits only"),
});
import * as authService from "../services/auth";
import * as merchantService from "../services/merchant";
import { registerApprovedMerchantVendor } from "../services/kyc";
import { resetAndReregisterVendor } from "../services/vendor";
import { setAuthCookie, clearAuthCookie } from "../middlewares/auth";
import { issueCsrfCookie } from "../middlewares/csrf";

const ProviderConfigBody = z.object({
  preferredProvider: z.string().trim().min(2).max(40),
  providerMerchantId: z.string().trim().max(120).optional().nullable(),
  providerStoreId: z.string().trim().max(120).optional().nullable(),
  providerTerminalId: z.string().trim().max(120).optional().nullable(),
  providerReference: z.string().trim().max(120).optional().nullable(),
  providerVpa: z.string().trim().max(120).optional().nullable(),
  providerStatus: z.string().trim().max(32).optional(),
});

function handleError(res: Response, e: unknown): void {
  if (e instanceof authService.AuthError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

export async function csrf(req: Request, res: Response): Promise<void> {
  const token = issueCsrfCookie(res);
  res.json({ csrfToken: token });
}

export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const { merchant, token } = await authService.signup(parsed.data);
    setAuthCookie(res, token);
    issueCsrfCookie(res);
    const m = await merchantService.getById(merchant.id);
    res.status(201).json({ merchant: m, ok: true });
  } catch (e) {
    handleError(res, e);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const { merchant, token } = await authService.login(parsed.data);
    setAuthCookie(res, token);
    issueCsrfCookie(res);
    const m = await merchantService.getById(merchant.id);
    res.json({ merchant: m, ok: true });
  } catch (e) {
    handleError(res, e);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearAuthCookie(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const m = await merchantService.getById(req.merchant!.id);
  if (!m) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }
  res.json({ merchant: m });
}

export async function updateKyc(req: Request, res: Response): Promise<void> {
  const parsed = UpdateKycBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const m = await merchantService.saveKycDetails(req.merchant!.id, parsed.data);
    if (!m) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }
    void registerApprovedMerchantVendor(req.merchant!.id);
    res.json({ merchant: m });
  } catch (e) {
    handleError(res, e);
  }
}

export async function updateProviderConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = ProviderConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const merchantId = req.merchant!.id;
    const m = await merchantService.saveProviderConfig(merchantId, parsed.data);
    if (!m) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }
    // If a UPI VPA was saved/changed, re-register the merchant as a Decentro
    // beneficiary so the new VPA is used for future QR generation.
    if (parsed.data.providerVpa) {
      void resetAndReregisterVendor(merchantId);
    }
    res.json({ merchant: m });
  } catch (e) {
    handleError(res, e);
  }
}
