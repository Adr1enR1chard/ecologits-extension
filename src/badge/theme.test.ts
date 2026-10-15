import { describe, expect, it } from "vitest";
import { lightness, schemeOfText } from "./theme";

describe("lightness", () => {
    it("reads rgb colors as perceived lightness", () => {
        expect(lightness("rgb(0, 0, 0)")).toBe(0);
        expect(lightness("rgb(255, 255, 255)")).toBeCloseTo(1);
        expect(lightness("rgb(119, 119, 119)")).toBeCloseTo(0.5, 1);
        expect(lightness("rgba(236, 236, 236, 0.9)")).toBeGreaterThan(0.9);
    });

    it("reads the lightness of oklch and lab colors", () => {
        expect(lightness("oklch(0.93 0.01 260)")).toBe(0.93);
        expect(lightness("oklch(20% 0 0)")).toBe(0.2);
        expect(lightness("lab(85 0 0)")).toBe(0.85);
    });

    it("gives up on other formats", () => {
        expect(lightness("color(srgb 1 1 1)")).toBeNull();
        expect(lightness("currentcolor")).toBeNull();
    });
});

describe("schemeOfText", () => {
    it("gives the page theme from its text color", () => {
        expect(schemeOfText("rgb(13, 13, 13)")).toBe("light");
        expect(schemeOfText("rgb(236, 236, 236)")).toBe("dark");
        expect(schemeOfText("oklch(0.9 0 0)")).toBe("dark");
    });

    it("falls back to light", () => {
        expect(schemeOfText("currentcolor")).toBe("light");
    });
});
