import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" permite servir o build de qualquer caminho (GitHub Pages, Labgrad, etc.)
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
});
