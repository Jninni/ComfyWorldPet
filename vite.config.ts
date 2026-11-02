import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { host: true },
  build: {
    target: "es2022",
    // The Babylon.js engine is one large library (~6 MB minified, ~1.4 MB gzipped).
    // Keep it in its own long-cached file so game updates don't re-download it.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: { main: "index.html" },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@babylonjs")) return "babylon";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
