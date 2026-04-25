import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Kyc from "@/pages/kyc";
import PaymentPage from "@/pages/payment";
import Layout from "@/components/layout";

const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ component: Component, ...rest }: any) {
  const token = localStorage.getItem("paylite_token");
  if (!token) {
    return <Redirect to="/login" />;
  }
  
  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/payment/:orderId" component={PaymentPage} />
      
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/orders">
        {() => <ProtectedRoute component={Orders} />}
      </Route>
      <Route path="/kyc">
        {() => <ProtectedRoute component={Kyc} />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
