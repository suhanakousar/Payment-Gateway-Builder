import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const isProd = process.env["NODE_ENV"] === "production";
const rawSecret = process.env["SESSION_SECRET"];

if (isProd && (!rawSecret || rawSecret.length < 24)) {
  throw new Error(
    "SESSION_SECRET must be set to a strong value (>=24 chars) in production.",
  );
}

const JWT_SECRET = rawSecret ?? "dev-only-secret-do-not-use-in-prod-32xyz";
const JWT_EXPIRY = "30d";
const BCRYPT_ROUNDS = 12;

export interface AuthTokenPayload {
  merchantId: string;
  email: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

declare module "express-serve-static-core" {
  interface Request {
    merchant?: AuthTokenPayload;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization") ?? req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const payload = verifyToken(token);
    req.merchant = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
