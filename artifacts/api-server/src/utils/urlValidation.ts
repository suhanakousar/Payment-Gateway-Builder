import net from "node:net";

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
]);

const ALLOW_PRIVATE = process.env["ALLOW_PRIVATE_WEBHOOK_URLS"] === "1";

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts as [number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  return false;
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateWebhookUrl(raw: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "URL must use http(s)" };
  }
  if (ALLOW_PRIVATE) return { ok: true };

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(host)) {
    return { ok: false, reason: "Private/loopback hosts are not allowed" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Internal hostnames are not allowed" };
  }
  const family = net.isIP(host);
  if (family === 4 && isPrivateIPv4(host)) {
    return { ok: false, reason: "Private IPv4 ranges are not allowed" };
  }
  if (family === 6 && isPrivateIPv6(host)) {
    return { ok: false, reason: "Private IPv6 ranges are not allowed" };
  }
  return { ok: true };
}
