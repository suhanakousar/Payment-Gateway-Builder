import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ensureCsrf } from "./api";

export interface Merchant {
  id: string;
  name: string;
  email: string;
  businessName: string;
  pan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  kycStatus: string;
  approved: boolean;
  createdAt: string;
}

interface AuthContextValue {
  merchant: Merchant | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMerchant: (m: Merchant | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await api<{ merchant: Merchant }>("/auth/me");
      setMerchant(res.merchant);
    } catch {
      setMerchant(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureCsrf();
      try {
        const res = await api<{ merchant: Merchant }>("/auth/me");
        if (!cancelled) setMerchant(res.merchant);
      } catch {
        if (!cancelled) setMerchant(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ merchant, loading, refresh, setMerchant }),
    [merchant, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
