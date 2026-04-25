import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the global fetch token getter
setAuthTokenGetter(() => {
  return localStorage.getItem("paylite_token");
});

createRoot(document.getElementById("root")!).render(<App />);
