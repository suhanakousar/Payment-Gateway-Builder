import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const isProd = process.env["NODE_ENV"] === "production";
const SECRET = process.env["SESSION_SECRET"];

if (isProd && (!SECRET || SECRET.length < 24)) {
  throw new Error("SESSION_SECRET must be set (>=24 chars) in production.");
}

const JWT_SECRET = SECRET ?? "dev-only-secret-do-not-use-in-prod-32xyz";

const COOKIE_NAME = "paylite_auth";
const COOKIE_TTL_DAYS = 7;
const COOKIE_TTL_SECONDS = COOKIE_TTL_DAYS * 24 * 60 * 60;

export interface AuthMerchant {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      merchant?: AuthMerchant;
    }
  }
}

export function signAuthToken(merchant: AuthMerchant): string {
  return jwt.sign(merchant, JWT_SECRET, { expiresIn: `${COOKIE_TTL_DAYS}d` });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: COOKIE_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readAuthFromRequest(req: Request): AuthMerchant | null {
  const fromCookie = (req as unknown as { cookies?: Record<string, string> })
    .cookies?.[COOKIE_NAME];
  const fromHeader = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = fromCookie ?? fromHeader;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthMerchant;
    if (!decoded?.id || !decoded?.email) return null;
    return { id: decoded.id, email: decoded.email };
  } catch {
    return null;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const merchant = readAuthFromRequest(req);
  if (!merchant) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.merchant = merchant;
  next();
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
