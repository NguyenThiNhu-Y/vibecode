import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // mermaid (lazy-loaded for architecture diagrams) ships a few large chunks by design.
  build: { chunkSizeWarningLimit: 1600 },
});
