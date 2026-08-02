import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: "client",
  plugins: [react()],
  publicDir: "../public",
  resolve: {
    alias: [
      {
        find: /^next\/link$/,
        replacement: fileURLToPath(
          new URL("./client/next-compat/link.tsx", import.meta.url),
        ),
      },
      {
        find: /^next\/navigation$/,
        replacement: fileURLToPath(
          new URL("./client/next-compat/navigation.ts", import.meta.url),
        ),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL(".", import.meta.url)),
      },
    ],
  },
  build: {
    outDir: "../dist-client",
    emptyOutDir: true,
    target: "es2021",
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  clearScreen: false,
});
