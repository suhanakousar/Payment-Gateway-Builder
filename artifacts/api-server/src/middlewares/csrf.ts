import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

const isProd = process.env["NODE_ENV"] === "production";
const COOKIE_NAME = "paylite_csrf";
const HEADER_NAME = "x-csrf-token";
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function issueCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(24).toString("base64url");
  res.cookie(COOKIE_NAME, token, {
    httpOnly: false, // frontend reads & echoes back in header
    secure: isProd,
    sameSite: "lax",
    maxAge: COOKIE_TTL_MS,
    path: "/",
  });
  return token;
}

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const cookies = (req as unknown as { cookies?: Record<string, string> })
    .cookies;
  const cookieToken = cookies?.[COOKIE_NAME];
  const headerToken = req.headers[HEADER_NAME];
  const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!cookieToken || !headerValue || !constantTimeEqual(cookieToken, headerValue)) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }
  next();
}

export const CSRF_COOKIE_NAME = COOKIE_NAME;
export const CSRF_HEADER_NAME = HEADER_NAME;
