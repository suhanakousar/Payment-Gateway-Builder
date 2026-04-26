const BASE = "/api";

const CSRF_COOKIE = "paylite_csrf";
const CSRF_HEADER = "X-CSRF-Token";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let csrfBootstrap: Promise<string | null> | null = null;

export async function ensureCsrf(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  if (!csrfBootstrap) {
    csrfBootstrap = fetch(`${BASE}/auth/csrf`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return null;
        const data: { csrfToken?: string } = await r.json().catch(() => ({}));
        return data.csrfToken ?? readCookie(CSRF_COOKIE);
      })
      .catch(() => null)
      .finally(() => {
        csrfBootstrap = null;
      });
  }
  return csrfBootstrap;
}

interface ApiOpts<TBody = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TBody;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOpts = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (method !== "GET") {
    const csrf = await ensureCsrf();
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    credentials: "include",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  let data: unknown = null;
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else if (res.status !== 204) {
    data = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in (data as object)
        ? String((data as { error?: string }).error)
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export async function apiBlob(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(buildUrl(path, query), { credentials: "include" });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  const dispo = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(dispo);
  return { blob: await res.blob(), filename: match ? match[1] ?? null : null };
}
