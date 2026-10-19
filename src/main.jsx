import "./lib/legado.js";   // primeiro: as regras publicam Core, AuthCore, Store...
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("raiz")).render(<React.StrictMode><App /></React.StrictMode>);
