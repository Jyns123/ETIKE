import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// En desarrollo Vite tambien sirve por HTTPS (la cookie de sesion es __Host-,
// exige Secure) y reenvia /api al backend, verificando su certificado con la CA propia.
const certs = fileURLToPath(new URL("../certs/", import.meta.url));
const leer = (f: string) => readFileSync(certs + f);

// Modo demo (npm run build:demo): la version estatica para GitHub Pages. No hay
// backend, asi que la CSP que normalmente manda FastAPI como cabecera va como
// <meta> (frame-ancestors no se puede declarar asi; Pages no permite cabeceras).
const CSP_DEMO =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";

function cspDemo(): Plugin {
  return {
    name: "csp-demo",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP_DEMO }, injectTo: "head-prepend" },
      { tag: "meta", attrs: { name: "referrer", content: "no-referrer" }, injectTo: "head" },
    ],
  };
}

export default defineConfig(({ command, mode }) => {
  const demo = mode === "demo";
  return {
    // rutas relativas: la demo vive en una subcarpeta del sitio de Pages (/ETIKE/demo/)
    base: demo ? "./" : "/",
    plugins: demo ? [react(), cspDemo()] : [react()],
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
    build: {
      outDir: demo ? "dist-demo" : "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      assetsInlineLimit: 0,
    },
  };
});
