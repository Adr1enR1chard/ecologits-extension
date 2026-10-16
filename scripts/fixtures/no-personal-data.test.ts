import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPersonalData } from "./personal-data";

const FIXTURES = fileURLToPath(new URL("../../test/fixtures/", import.meta.url));

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

describe("findPersonalData", () => {
    const clean =
        'data: {"id":"00000000-0000-4000-8000-0000000000a1","token":"REDACTED","text":"xxxxx xx 00"}';

    it("accepts zeroed ids, redacted tokens and masked text", () => {
        expect(findPersonalData(clean)).toEqual([]);
    });

    it.each([
        ["email", "jane.doe@example.com"],
        ["uuid", "3f2b8c1e-9d4a-4e7b-8c2d-1a5f6e7d8c9b"],
        [
            "jwt",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
        ],
        ["base64", "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MEFCQ0RFRkdISUpL"],
    ])("finds a planted %s", (kind, planted) => {
        expect(findPersonalData(clean.replace("xxxxx xx 00", planted))).toContainEqual({
            kind,
            match: planted,
        });
    });

    it("finds a planted id in a DOM snapshot", () => {
        const html = '<div data-message-id="3f2b8c1e-9d4a-4e7b-8c2d-1a5f6e7d8c9b">xxx</div>';
        expect(findPersonalData(html)).toHaveLength(1);
    });
});
