import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifestVersion: 3,
    manifest: {
        name: "__MSG_extName__",
        description: "__MSG_extDescription__",
        default_locale: "en",
        permissions: ["storage"],
        browser_specific_settings: {
            gecko: {
                id: "ecologits-extension@ecologits.ai",
                strict_min_version: "128.0",
            },
        },
    },
    vite: () => ({
        plugins: [preact(), tailwindcss()],
    }),
});
