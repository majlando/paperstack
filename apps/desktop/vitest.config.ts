import { defineConfig } from "vitest/config";

// Standalone vitest config: the app's vite.config.ts pulls in the React and
// Tailwind plugins plus Tauri dev-server wiring, none of which the store
// tests need (they run in plain Node with the Tauri modules mocked).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
