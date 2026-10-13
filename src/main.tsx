import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppUIProvider } from "./components/AppUI";
import "./styles.css";
import { captureEmbedKeyFromUrl } from "./shared/security/embedKey";

// Must run before routing reads the URL (removes ?evk= from the address bar).
captureEmbedKeyFromUrl();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppUIProvider>
        <App />
      </AppUIProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
