import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@lib\/(.*)\.js$/,
        replacement: fileURLToPath(new URL("./src/lib/$1.ts", import.meta.url)),
      },
      {
        find: /^@lib\/(.*)$/,
        replacement: fileURLToPath(new URL("./src/lib/$1.ts", import.meta.url)),
      },
      {
        find: /^@benchmark\/(.*)\.js$/,
        replacement: fileURLToPath(new URL("./src/benchmark/$1.ts", import.meta.url)),
      },
      {
        find: /^@benchmark\/(.*)$/,
        replacement: fileURLToPath(new URL("./src/benchmark/$1.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
    },
  },
});
