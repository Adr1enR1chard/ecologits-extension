import { defineConfig } from "@playwright/test";

// Tests in a real browser, on the development build (`pnpm test:e2e` builds it first).
export default defineConfig({
    testDir: "e2e",
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? "github" : "list",
});
