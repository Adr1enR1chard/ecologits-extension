import { describe, expect, it } from "vitest";
import { findPersonalData } from "./personal-data";

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
