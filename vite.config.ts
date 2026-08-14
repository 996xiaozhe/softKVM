import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
   environment: "node",
   include: ["src/**/*.test.ts"],
   coverage: {
     provider: "v8",
     reporter: ["text", "lcov"],
     include: ["src/i18n/**/*.ts", "src/lib/**/*.ts"]
   }
  }
});
