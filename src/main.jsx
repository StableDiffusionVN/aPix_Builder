import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import { initializeAppSettings } from "./lib/appSettings.js";
import "./styles.css";
import "./styles/tokens.css";
import "./styles/refined-ui.css";
import "./styles/modals.css";

async function bootstrap() {
  await initializeAppSettings();
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>
  );
}

bootstrap();
