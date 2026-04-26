import type { PaymentProvider } from "./types";
import { mockProvider } from "./mock";
import { razorpayProvider } from "./razorpay";
import { cashfreeProvider } from "./cashfree";
import { ProviderRouter, parseWeights } from "./router";

const router = new ProviderRouter();

const weights = parseWeights(
  process.env["PROVIDER_WEIGHTS"] ?? "razorpay:70,cashfree:25,mock:5",
);

for (const p of [razorpayProvider, cashfreeProvider, mockProvider]) {
  router.register(p, weights.get(p.name) ?? 0);
}

export const providerRouter = router;

export function getProvider(name: string): PaymentProvider {
  return router.get(name) ?? mockProvider;
}

export function listProviders(): PaymentProvider[] {
  return router.list();
}

export type { PaymentProvider } from "./types";
