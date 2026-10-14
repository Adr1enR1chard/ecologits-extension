import { describe, expect, it } from "vitest";
import { impactResult } from "../test-utils";
import { MAX_EVENTS, appendEvent } from "./events";

describe("appendEvent", () => {
    it("appends without mutating", () => {
        const events = [impactResult({ messageId: "a" })];
        const next = appendEvent(events, impactResult({ messageId: "b" }));
        expect(next.map((e) => e.messageId)).toEqual(["a", "b"]);
        expect(events).toHaveLength(1);
    });

    it(`keeps only the newest ${MAX_EVENTS} events`, () => {
        let events = Array.from({ length: MAX_EVENTS }, (_, i) =>
            impactResult({ messageId: String(i) }),
        );
        events = appendEvent(events, impactResult({ messageId: "new" }));
        expect(events).toHaveLength(MAX_EVENTS);
        expect(events[0]!.messageId).toBe("1");
        expect(events.at(-1)!.messageId).toBe("new");
    });
});
