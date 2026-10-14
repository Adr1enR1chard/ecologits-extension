import { describe, expect, it } from "vitest";
import { EQUIVALENCES } from "../impacts/equivalences";
import { EQUIVALENCE_LABELS } from "./labels";

describe("EQUIVALENCE_LABELS", () => {
    it("labels every equivalence", () => {
        expect(Object.keys(EQUIVALENCE_LABELS).sort()).toEqual(
            EQUIVALENCES.map((e) => e.id).sort(),
        );
    });
});
