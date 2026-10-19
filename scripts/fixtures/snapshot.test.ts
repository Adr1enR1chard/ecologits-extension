import { describe, expect, it } from "vitest";
import claudeFixtures from "../../test/fixtures/claude/fixtures";
import { anonymiseStream } from "./anonymise";
import { findPersonalData, ZeroedIds } from "./personal-data";
import { sanitiseSnapshot } from "./snapshot";

const ID_A = "3f2b8c1e-9d4a-4e7b-8c2d-1a5f6e7d8c9b";
const ID_B = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ZERO_1 = "00000000-0000-4000-8000-000000000001";
const ZERO_2 = "00000000-0000-4000-8000-000000000002";
const JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("sanitiseSnapshot", () => {
    it("drops scripts, styles and links, and empties SVGs", () => {
        const html =
            '<div><script>track("me")</script><style>.a{color:red}</style>' +
            '<link rel="stylesheet" href="https://example.com/a.css">' +
            '<svg class="icon" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"></path></svg></div>';
        expect(sanitiseSnapshot(html)).toBe('<div><svg class="icon"></svg></div>');
    });

    it("drops inline styles", () => {
        expect(sanitiseSnapshot('<div class="a" style="width: 42px"></div>')).toBe(
            '<div class="a"></div>',
        );
    });

    it("masks text nodes, keeping punctuation, spaces and lengths", () => {
        expect(sanitiseSnapshot("<p>Hi Bob, it is 42°C!</p>")).toBe("<p>xx xxx, xx xx 00°x!</p>");
    });

    it("masks alt, title and aria-label values", () => {
        const html = '<img alt="Bob 1"><button title="Copy" aria-label="Copy reply"></button>';
        expect(sanitiseSnapshot(html)).toBe(
            '<img alt="xxx 0"><button title="xxxx" aria-label="xxxx xxxxx"></button>',
        );
    });

    it("keeps data-*, class, role and id, and drops every other attribute", () => {
        const html =
            '<a data-testid="link" class="a b" role="link" id="x" href="https://example.com/me"' +
            ' target="_blank" tabindex="0">x</a>';
        expect(sanitiseSnapshot(html)).toBe(
            '<a data-testid="link" class="a b" role="link" id="x">x</a>',
        );
    });

    it("masks data-* and id values that may be text or hold a token", () => {
        const html =
            `<div data-title="Jane Doe's lawyer" data-topic="divorce lawyer" id="Jane"` +
            ` data-href="/api?session=AbCdEfGhIjKlMnOpQr0123" data-ref="see ${ID_A}"></div>`;
        expect(sanitiseSnapshot(html)).toBe(
            `<div data-title="xxxx xxx'x xxxxxx" data-topic="xxxxxxx xxxxxx" id="xxxx"` +
                ` data-href="/xxx?xxxxxxx=xxxxxxxxxxxxxxxxxx0000" data-ref="xxx ${ZERO_1}"></div>`,
        );
    });

    it("masks the content of nested templates", () => {
        expect(sanitiseSnapshot('<div><template><p title="Bob">Hi Bob</p></template></div>')).toBe(
            '<div><template><p title="xxx">xx xxx</p></template></div>',
        );
    });

    it("maps each id to the same zeroed UUID, in attributes and text", () => {
        const html =
            `<div data-turn-key="${ID_A}"><li id="${ID_B}">see ${ID_A}</li>` +
            `<span data-ids="${ID_B.toUpperCase()} ${ID_A}"></span></div>`;
        expect(sanitiseSnapshot(html)).toBe(
            `<div data-turn-key="${ZERO_1}"><li id="${ZERO_2}">xxx ${ZERO_1}</li>` +
                `<span data-ids="${ZERO_2} ${ZERO_1}"></span></div>`,
        );
    });

    it("maps the ids alike in the stream and the snapshot of a case", () => {
        const ids = new ZeroedIds();
        const stream = anonymiseStream(
            claudeFixtures.rules,
            `event: message_start\ndata: {"type":"message_start","message":{"uuid":"${ID_B}"}}\n\n`,
            ids,
        );
        const snapshot = sanitiseSnapshot(`<div data-turn-key="${ID_B}"></div>`, ids);
        expect(stream).toContain(ZERO_1);
        expect(snapshot).toBe(`<div data-turn-key="${ZERO_1}"></div>`);
    });

    it("redacts tokens in kept attributes and drops comments", () => {
        expect(sanitiseSnapshot(`<div data-token="${JWT}"><!-- ${ID_A} --></div>`)).toBe(
            '<div data-token="REDACTED"></div>',
        );
    });

    it("leaves a redacted token as it is when sanitising again", () => {
        const snapshot = sanitiseSnapshot(`<div data-token="${JWT}"></div>`);
        expect(sanitiseSnapshot(snapshot)).toBe(snapshot);
    });

    it("leaves no personal data", () => {
        const html =
            `<li id="${ID_A}" title="jane.doe@example.com">Mail jane.doe@example.com` +
            `<img alt="${JWT}" src="https://example.com/${ID_B}.png"></li>`;
        expect(findPersonalData(sanitiseSnapshot(html))).toEqual([]);
    });
});
