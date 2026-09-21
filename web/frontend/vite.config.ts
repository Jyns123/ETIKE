import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En desarrollo Vite tambien sirve por HTTPS (la cookie de sesion es __Host-,
// exige Secure) y reenvia /api al backend, verificando su certificado con la CA propia.
const certs = fileURLToPath(new URL("../certs/", import.meta.url));
const leer = (f: string) => readFileSync(certs + f);

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server:
    command === "serve"
      ? {
          port: 5173,
          https: { cert: leer("server.crt"), key: leer("server.key") },
          proxy: {
            "/api": { target: "https://localhost:8443", secure: true, ca: leer("ca.crt") } as never,
          },
        }
      : undefined,
  // assetsInlineLimit 0: nada de data: URIs, asi la CSP puede quedarse en font-src 'self'
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 900, assetsInlineLimit: 0 },
}));
