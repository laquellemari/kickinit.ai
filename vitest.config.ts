import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/helpers/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "src/app/api/**"],
      exclude: ["**/types.ts"],
      thresholds: {
        "src/lib/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/app/api/**": { statements: 85, branches: 85, functions: 85, lines: 85 },
        "src/components/**": { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
});
