import type { PaymentProvider } from "./types";
import { mockProvider } from "./mock";

export type ProviderName = "mock";

const providers: Record<ProviderName, PaymentProvider> = {
  mock: mockProvider,
};

export function getProvider(name: ProviderName | string = "mock"): PaymentProvider {
  if (name in providers) return providers[name as ProviderName];
  return providers.mock;
}

export const defaultProviderName: ProviderName =
  (process.env["PAYMENT_PROVIDER"] as ProviderName) ?? "mock";

export type { PaymentProvider } from "./types";
