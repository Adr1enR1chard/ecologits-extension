import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
    plugins: [WxtVitest()],
    test: {
        include: ["src/**/*.test.ts", "entrypoints/**/*.test.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**", "entrypoints/**"],
            reporter: ["text", "html"],
        },
    },
});
