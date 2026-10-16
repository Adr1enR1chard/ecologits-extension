import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);

/** Source files of the extension: what ends up in the production builds. */
const sources = ["src", "entrypoints"].flatMap((dir) =>
    readdirSync(new URL(`${dir}/`, ROOT), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:m?[jt]sx?|vue|css|html)$/.test(entry.name))
        .map((entry) => `${entry.parentPath}/${entry.name}`),
);

describe("fixture tooling", () => {
    it("is never imported by the extension", () => {
        expect(sources.length).toBeGreaterThan(0);
        const importers = sources.filter((file) =>
            /\bfrom\s+["'][^"']*\bscripts\/|\bimport\(\s*["'][^"']*\bscripts\//.test(
                readFileSync(file, "utf8"),
            ),
        );
        expect(importers).toEqual([]);
    });
});
