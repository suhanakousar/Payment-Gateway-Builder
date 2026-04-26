import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Webhooks from "@/pages/webhooks";
import Kyc from "@/pages/kyc";
import Settlements from "@/pages/settlements";
import Disputes from "@/pages/disputes";
import PaymentPage from "@/pages/payment";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="h-8 w-8 rounded-full border-2 border-neutral-200 border-t-neutral-800 animate-spin" />
    </div>
  );
}

function Protected({ component: Component }: { component: React.ComponentType }) {
  const { merchant, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!merchant) return <Redirect to="/login" />;
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/payment/:orderId" component={PaymentPage} />

      <Route path="/dashboard">{() => <Protected component={Dashboard} />}</Route>
      <Route path="/orders">{() => <Protected component={Orders} />}</Route>
      <Route path="/webhooks">{() => <Protected component={Webhooks} />}</Route>
      <Route path="/kyc">{() => <Protected component={Kyc} />}</Route>
      <Route path="/settlements">{() => <Protected component={Settlements} />}</Route>
      <Route path="/disputes">{() => <Protected component={Disputes} />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={150}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "white",
                color: "#171717",
                border: "1px solid #e5e5e5",
                fontSize: "0.875rem",
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
