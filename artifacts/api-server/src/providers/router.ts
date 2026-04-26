import type { PaymentProvider, ProviderOrderInput, ProviderOrderResult } from "./types";

/**
 * Smart router for payment providers.
 *
 *  - Weighted random selection across healthy providers (configured via
 *    PROVIDER_WEIGHTS = "razorpay:70,cashfree:25,mock:5").
 *  - Per-provider circuit breaker: 3 consecutive failures opens it for 60s.
 *  - On createQR failure the next-best healthy provider is tried automatically.
 */

interface Health {
  name: string;
  consecutiveFailures: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  openUntil: number; // epoch ms; 0 if closed
  lastError: string | null;
  lastSuccessAt: number | null;
}

const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;

export class ProviderRouter {
  private providers: Map<string, PaymentProvider> = new Map();
  private health: Map<string, Health> = new Map();
  private weights: Map<string, number> = new Map();

  register(provider: PaymentProvider, weight: number): void {
    this.providers.set(provider.name, provider);
    this.weights.set(provider.name, Math.max(0, weight));
    this.health.set(provider.name, {
      name: provider.name,
      consecutiveFailures: 0,
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      openUntil: 0,
      lastError: null,
      lastSuccessAt: null,
    });
  }

  get(name: string): PaymentProvider | null {
    return this.providers.get(name) ?? null;
  }

  list(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** Healthy = circuit closed AND provider says it's available. */
  private isHealthy(name: string): boolean {
    const h = this.health.get(name);
    const p = this.providers.get(name);
    if (!h || !p) return false;
    if (Date.now() < h.openUntil) return false;
    if (!p.isAvailable()) return false;
    return true;
  }

  private pickHealthyOrder(exclude: Set<string>): PaymentProvider[] {
    const candidates: { provider: PaymentProvider; weight: number }[] = [];
    for (const [name, weight] of this.weights) {
      if (exclude.has(name)) continue;
      if (!this.isHealthy(name)) continue;
      const p = this.providers.get(name);
      if (!p || weight <= 0) continue;
      candidates.push({ provider: p, weight });
    }
    // Weighted shuffle: produce a permutation favouring higher weights.
    const out: PaymentProvider[] = [];
    while (candidates.length > 0) {
      const total = candidates.reduce((s, c) => s + c.weight, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < candidates.length; i++) {
        r -= candidates[i]!.weight;
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      out.push(candidates[idx]!.provider);
      candidates.splice(idx, 1);
    }
    return out;
  }

  private recordSuccess(name: string): void {
    const h = this.health.get(name);
    if (!h) return;
    h.consecutiveFailures = 0;
    h.totalAttempts++;
    h.totalSuccesses++;
    h.openUntil = 0;
    h.lastSuccessAt = Date.now();
    h.lastError = null;
  }

  private recordFailure(name: string, err: unknown): void {
    const h = this.health.get(name);
    if (!h) return;
    h.consecutiveFailures++;
    h.totalAttempts++;
    h.totalFailures++;
    h.lastError = err instanceof Error ? err.message : String(err);
    if (h.consecutiveFailures >= FAILURE_THRESHOLD) {
      h.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    }
  }

  /**
   * Create an order picking the best available provider, falling back through
   * the rest on failure. Returns the chosen provider name + result.
   */
  async createOrder(input: ProviderOrderInput): Promise<{
    provider: string;
    result: ProviderOrderResult;
    attempted: string[];
  }> {
    const attempted: string[] = [];
    const tried = new Set<string>();
    // Try up to 3 providers before bubbling up.
    for (let i = 0; i < 3; i++) {
      const order = this.pickHealthyOrder(tried);
      if (order.length === 0) break;
      const next = order[0]!;
      attempted.push(next.name);
      tried.add(next.name);
      try {
        const result = await next.createQR(input);
        this.recordSuccess(next.name);
        return { provider: next.name, result, attempted };
      } catch (err) {
        this.recordFailure(next.name, err);
        continue;
      }
    }
    throw new Error(
      `All providers failed (${attempted.join(", ") || "none healthy"})`,
    );
  }

  /** Snapshot of provider health for monitoring/dashboard. */
  snapshot(): Array<{
    name: string;
    displayName: string;
    weight: number;
    healthy: boolean;
    circuitOpenMs: number;
    successes: number;
    failures: number;
    lastError: string | null;
    lastSuccessAt: number | null;
  }> {
    return [...this.providers.values()].map((p) => {
      const h = this.health.get(p.name)!;
      return {
        name: p.name,
        displayName: p.displayName,
        weight: this.weights.get(p.name) ?? 0,
        healthy: this.isHealthy(p.name),
        circuitOpenMs: Math.max(0, h.openUntil - Date.now()),
        successes: h.totalSuccesses,
        failures: h.totalFailures,
        lastError: h.lastError,
        lastSuccessAt: h.lastSuccessAt,
      };
    });
  }
}

/** Parses PROVIDER_WEIGHTS env. Default favors razorpay heavily. */
export function parseWeights(input: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!input) return out;
  for (const part of input.split(",")) {
    const [k, v] = part.split(":");
    if (!k) continue;
    const n = Number(v ?? "0");
    out.set(k.trim(), Number.isFinite(n) ? Math.max(0, n) : 0);
  }
  return out;
}
