import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pluginSw from "./pwa/plugin.mjs";

// base "./": funciona em qualquer endereço (GitHub Pages com o nome do repositório, ou domínio próprio).
export default defineConfig({
  // pluginSw: gera dist/sw.js (app instalável e sem internet) a cada build
  plugins: [react(), pluginSw()],
  base: "./",
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: false }
});
