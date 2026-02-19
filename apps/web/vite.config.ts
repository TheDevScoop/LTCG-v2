import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-sentry': ['@sentry/react'],
          'vendor-motion': ['framer-motion'],
          'vendor-privy': ['@privy-io/react-auth'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: "lunchtable",
      project: "lunchtable",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true, // Suppress verbose logs
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex-generated-api": path.resolve(__dirname, "../../convex/_generated/api.js"),
    },
  },
  server: {
    port: 3334,
  },
});
