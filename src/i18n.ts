import { browser } from "wxt/browser";

/** Message keys defined in `public/_locales/<lang>/messages.json`. */
export type MessageKey = "extName" | "extDescription" | "popupEmpty";

export function t(key: MessageKey, substitutions?: string | string[]): string {
    return browser.i18n.getMessage(key, substitutions);
}
