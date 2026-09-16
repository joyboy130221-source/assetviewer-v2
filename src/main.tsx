import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppUIProvider } from "./components/AppUI";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppUIProvider>
        <App />
      </AppUIProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
