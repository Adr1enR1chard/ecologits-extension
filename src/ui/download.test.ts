import { describe, expect, it } from "vitest";
import { exportFileName } from "./download";

describe("exportFileName", () => {
    it("includes the kind and the local date", () => {
        expect(exportFileName("events", "csv", new Date(2026, 9, 14, 23).getTime())).toBe(
            "ecologits-events-2026-10-14.csv",
        );
    });
});
