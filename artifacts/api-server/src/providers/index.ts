import type { PaymentProvider } from "./types";
import { mockProvider } from "./mock";
import { razorpayProvider } from "./razorpay";
import { cashfreeProvider } from "./cashfree";
import { decentroProvider } from "./decentro";
import { ProviderRouter, parseWeights } from "./router";

const router = new ProviderRouter();
const defaultProviderName = process.env["DEFAULT_PROVIDER"] ?? "decentro";

const weights = parseWeights(
  process.env["PROVIDER_WEIGHTS"] ?? "decentro:90,cashfree:5,mock:5",
);

for (const p of [decentroProvider, razorpayProvider, cashfreeProvider, mockProvider]) {
  router.register(p, weights.get(p.name) ?? 0);
}

export const providerRouter = router;

export function getProvider(name: string): PaymentProvider {
  return router.get(name) ?? router.get(defaultProviderName) ?? mockProvider;
}

export function listProviders(): PaymentProvider[] {
  return router.list();
}

export type { PaymentProvider } from "./types";
