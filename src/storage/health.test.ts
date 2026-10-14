import { describe, expect, it } from "vitest";
import { adapterHealth } from "./health";

describe("adapterHealth", () => {
    const status = { provider: "chatgpt" as const, lastError: null };

    it("reflects the last outcome", () => {
        expect(adapterHealth({ ...status, lastSuccessAt: null, lastFailureAt: null })).toBe(
            "unknown",
        );
        expect(adapterHealth({ ...status, lastSuccessAt: 2, lastFailureAt: 1 })).toBe("ok");
        expect(adapterHealth({ ...status, lastSuccessAt: 1, lastFailureAt: 2 })).toBe("failing");
        expect(adapterHealth({ ...status, lastSuccessAt: null, lastFailureAt: 1 })).toBe("failing");
    });
});
