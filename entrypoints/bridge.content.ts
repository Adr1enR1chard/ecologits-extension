import "@/src/styles/badge.css";
import { findReplyAnchor } from "@/src/badge/anchor";
import { createBadgeManager } from "@/src/badge/manager";
import { shadowRootBadgeMount } from "@/src/badge/mount";
import { relay } from "@/src/capture/bridge";
import { acceptChannel } from "@/src/capture/channel";
import { uiLocale } from "@/src/i18n";
import {
    CAPTURED_PROVIDERS,
    isCapturedProvider,
    matchPatterns,
    providerForHost,
} from "@/src/providers/registry";
import { DEFAULT_SETTINGS, getSettings, watchSettings } from "@/src/storage/settings";

export default defineContentScript({
    matches: matchPatterns(...CAPTURED_PROVIDERS),
    runAt: "document_start",
    cssInjectionMode: "ui",
    async main(ctx) {
        const provider = providerForHost(window.location.hostname);
        if (!isCapturedProvider(provider)) return;
        const debug = import.meta.env.DEV
            ? (step: string, details?: unknown) => console.debug("[ecologits]", step, details ?? "")
            : () => undefined;
        const send = async (message: unknown) => {
            const reply: unknown = await browser.runtime.sendMessage(message);
            debug("background reply", reply);
            return reply;
        };
        // Disabled until the settings are read; replies captured meanwhile are shown then.
        const badges = createBadgeManager({
            findAnchor: (messageId) => findReplyAnchor(document, messageId, provider),
            mount: shadowRootBadgeMount(ctx, uiLocale()),
            enabled: false,
            debug,
        });
        acceptChannel(window, window.location.origin, (data) => {
            debug("bridge received", data);
            void relay(data, provider, send).then((result) => {
                if (result !== null) badges.show(result);
            });
        });
        debug("bridge installed", provider);

        const settings = await getSettings().catch((error: unknown) => {
            debug("settings unreadable, using defaults", error);
            return DEFAULT_SETTINGS;
        });
        badges.setEnabled(settings.showBadge);
        ctx.onInvalidated(watchSettings((settings) => badges.setEnabled(settings.showBadge)));
    },
});
