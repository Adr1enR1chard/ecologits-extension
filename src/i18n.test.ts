import { describe, expect, it } from "vitest";
import en from "../public/_locales/en/messages.json";
import fr from "../public/_locales/fr/messages.json";

describe("locales", () => {
    it("define the same keys in every language", () => {
        expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    });

    it("have a non-empty message for every key", () => {
        for (const messages of [en, fr]) {
            for (const entry of Object.values(messages)) {
                expect(entry.message.trim()).not.toBe("");
            }
        }
    });
});
