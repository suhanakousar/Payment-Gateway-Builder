import crypto from "node:crypto";

const isProd = process.env["NODE_ENV"] === "production";
const rawSecret = process.env["SESSION_SECRET"];

if (isProd && (!rawSecret || rawSecret.length < 24)) {
  throw new Error(
    "SESSION_SECRET must be set to a strong value (>=24 chars) in production.",
  );
}

const SECRET = rawSecret ?? "dev-only-secret-do-not-use-in-prod-32xyz";

// 32-byte AES key derived from SESSION_SECRET; stable across restarts so
// previously-encrypted KYC fields stay readable.
const AES_KEY = crypto.createHash("sha256").update(SECRET).digest();

const ENC_PREFIX = "enc:v1:";

/**
 * Encrypts a UTF-8 string using AES-256-GCM. Returns base64-encoded payload
 * `enc:v1:<iv>.<tag>.<ciphertext>` so we can detect already-encrypted values
 * on read and rotate algorithms later.
 */
export function encryptString(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return null;
  if (plain.startsWith(ENC_PREFIX)) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", AES_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const blob = `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
  return ENC_PREFIX + blob;
}

export function decryptString(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext value

  const blob = stored.slice(ENC_PREFIX.length);
  const parts = blob.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0]!, "base64");
    const tag = Buffer.from(parts[1]!, "base64");
    const ciphertext = Buffer.from(parts[2]!, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", AES_KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function maskTail(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "•".repeat(value.length);
  return "•".repeat(Math.min(8, value.length - visible)) + value.slice(-visible);
}

export function maskPan(pan: string | null): string | null {
  if (!pan) return null;
  return pan.length <= 4 ? "•".repeat(pan.length) : "••••••" + pan.slice(-4);
}

export function maskBankAccount(acct: string | null): string | null {
  if (!acct) return null;
  return acct.length <= 4 ? "•".repeat(acct.length) : "••••" + acct.slice(-4);
}

export function generateWebhookSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("hex");
}

export function hmacSha256Hex(secret: string, data: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
