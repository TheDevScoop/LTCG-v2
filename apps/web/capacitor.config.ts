import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lunchtable.tcg",
  appName: "LunchTable TCG",
  webDir: "dist",
  server: {
    // In dev, point to Vite dev server
    // Comment out for production builds
    // url: "http://localhost:3334",
    // cleartext: true,
  },
};

export default config;
