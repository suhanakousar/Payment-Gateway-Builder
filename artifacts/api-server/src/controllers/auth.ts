import type { Request, Response } from "express";
import {
  SignupBody,
  LoginBody,
  UpdateKycBody,
} from "@workspace/api-zod";
import * as authService from "../services/auth";
import * as merchantService from "../services/merchant";
import { setAuthCookie, clearAuthCookie } from "../middlewares/auth";
import { issueCsrfCookie } from "../middlewares/csrf";

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
    const m = await merchantService.updateKyc(req.merchant!.id, parsed.data);
    if (!m) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }
    res.json({ merchant: m });
  } catch (e) {
    handleError(res, e);
  }
}
