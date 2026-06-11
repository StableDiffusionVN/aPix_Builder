import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./styles/themes.css";
import "./styles/tokens.css";
import "./styles/colorful-tokens.css";
import "./styles/refined-ui.css";
import "./styles/modals.css";
import "./styles/colorful-ui.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
