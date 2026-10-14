import { describe, expect, it, vi } from "vitest";
import en from "../public/_locales/en/messages.json";
import fr from "../public/_locales/fr/messages.json";
import { uiLocale } from "./i18n";

const i18n = vi.hoisted(() => ({ messages: "en", ui: "en_US" }));

vi.mock("wxt/browser", () => ({
    browser: {
        i18n: {
            getMessage: (key: string) =>
                key === "messagesLocale" ? i18n.messages : key === "@@ui_locale" ? i18n.ui : "",
            getUILanguage: () => i18n.ui.replace("_", "-"),
        },
    },
}));

interface Entry {
    message: string;
    placeholders?: Record<string, { content: string }>;
}

const locales: Record<string, Record<string, Entry>> = { en, fr };

describe("locales", () => {
    it("define the same keys in every language", () => {
        expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    });

    it("have a non-empty message for every key", () => {
        for (const messages of Object.values(locales)) {
            for (const entry of Object.values(messages)) {
                expect(entry.message.trim()).not.toBe("");
            }
        }
    });

    it("declare every placeholder they use, the same way in every language", () => {
        for (const [key, entry] of Object.entries(locales.en!)) {
            for (const [lang, messages] of Object.entries(locales)) {
                const { message, placeholders = {} } = messages[key]!;
                // Placeholder names are case-insensitive: letters, digits and underscores.
                const used = [...message.matchAll(/\$(\w+)\$/g)].map((m) => m[1]!.toLowerCase());
                const declared = Object.keys(placeholders).map((name) => name.toLowerCase());
                expect(new Set(used), `${lang}.${key}`).toEqual(new Set(declared));
                expect(placeholders, `${lang}.${key}`).toEqual(entry.placeholders ?? {});
            }
        }
    });
});

describe("uiLocale", () => {
    it("keeps the browser locale when the messages are in its language", () => {
        Object.assign(i18n, { messages: "fr", ui: "fr_CA" });
        expect(uiLocale()).toBe("fr-CA");
        Object.assign(i18n, { messages: "en", ui: "en_US" });
        expect(uiLocale()).toBe("en-US");
    });

    it("uses the messages' language when the browser locale fell back to another one", () => {
        Object.assign(i18n, { messages: "en", ui: "de" });
        expect(uiLocale()).toBe("en");
    });
});
