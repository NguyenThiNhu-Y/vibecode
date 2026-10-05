import baseConfig from "./vite.config";
import { defineConfig, type Plugin } from "vite";

const PREVIEW_PREFIX_RE = /^\/api\/v1\/sessions\/[^/]+\/preview\/\d+/;

function stripPreviewPrefix(): Plugin {
  return {
    name: "strip-preview-prefix",
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "/";
        const m = url.match(PREVIEW_PREFIX_RE);
        if (m) {
          const rest = url.slice(m[0].length);
          req.url = rest.length === 0 ? "/" : rest;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  ...baseConfig,
  plugins: [...(baseConfig.plugins ?? []), stripPreviewPrefix()],
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});