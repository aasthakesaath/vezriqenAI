import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "next/link": fileURLToPath(new URL("./tests/mocks/next-link.tsx", import.meta.url)),
      "next/image": fileURLToPath(new URL("./tests/mocks/next-image.tsx", import.meta.url)),
    },
  },
  test: { globals: true, environment: "node", include: ["tests/**/*.test.tsx"] },
});
