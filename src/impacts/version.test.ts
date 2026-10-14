import { ECOLOGITS_VERSION as LIBRARY_VERSION } from "@ecologits/ecologits.js";
import { describe, expect, it } from "vitest";
import { ECOLOGITS_VERSION } from "./version";

describe("ECOLOGITS_VERSION", () => {
    it("matches the installed EcoLogits library", () => {
        expect(ECOLOGITS_VERSION).toBe(LIBRARY_VERSION);
    });
});
