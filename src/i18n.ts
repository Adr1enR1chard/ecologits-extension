import { browser } from "wxt/browser";
import type en from "../public/_locales/en/messages.json";

/** Message keys defined in `public/_locales/<lang>/messages.json`. */
export type MessageKey = keyof typeof en;

export function t(key: MessageKey, substitutions?: string | string[]): string {
    return browser.i18n.getMessage(key, substitutions);
}

/**
 * Locale the messages are shown in, as a BCP 47 tag, so numbers and dates are formatted like the
 * surrounding text. The browser locale (`fr-CA`, `en-US`…) is kept when the messages are in its
 * language; otherwise (e.g. a German browser, shown the English fallback) the messages' language.
 */
export function uiLocale(): string {
    const messages = browser.i18n.getMessage("messagesLocale");
    const browserLocale = (
        browser.i18n.getMessage("@@ui_locale") || browser.i18n.getUILanguage()
    ).replaceAll("_", "-");
    if (!messages) return browserLocale;
    const sameLanguage = browserLocale.split("-")[0]!.toLowerCase() === messages.toLowerCase();
    return sameLanguage ? browserLocale : messages;
}
