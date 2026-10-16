import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPersonalData, ZeroedIds } from "../scripts/fixtures/personal-data";
import { sanitiseSnapshot } from "../scripts/fixtures/snapshot";

/** What the anonymiser guarantees of every fixture committed in `fixtures/`. */

const FIXTURES = fileURLToPath(new URL("fixtures/", import.meta.url));

/** Every committed fixture: streams, DOM snapshots (`.html`) and any other file. */
const files = readdirSync(FIXTURES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(FIXTURES, join(entry.parentPath, entry.name)));

describe("committed fixtures", () => {
    it("include the recorded streams and the DOM snapshots", () => {
        expect(files).toContain("chatgpt/normal-reply.sse");
        expect(files).toContain("claude/normal-reply.sse");
        expect(files).toContain("chatgpt/normal-reply.html");
        expect(files).toContain("claude/normal-reply.html");
    });

    it.each(files)("%s holds no personal data", (file) => {
        expect(findPersonalData(readFileSync(join(FIXTURES, file), "utf8"))).toEqual([]);
    });
});

/** Every committed DOM snapshot. */
const snapshots = readdirSync(FIXTURES, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".html"),
);

describe("committed DOM snapshots", () => {
    // Up to the numbering of its ids, which sanitising again restarts from 1.
    it.each(snapshots)("%s is already sanitised", (file) => {
        const html = readFileSync(join(FIXTURES, file), "utf8");
        expect(sanitiseSnapshot(html)).toBe(new ZeroedIds().mapUuids(html));
    });
});
