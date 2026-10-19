import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": funciona em qualquer endereço (GitHub Pages com o nome do repositório, ou domínio próprio).
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: false }
});
