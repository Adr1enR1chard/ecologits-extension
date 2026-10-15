// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlagIcons } from "./FlagIcons";
import { ImpactValue } from "./ImpactValue";
import { Tooltip } from "./Tooltip";

// Messages are their key followed by their substitutions.
vi.mock("wxt/browser", () => ({
    browser: {
        i18n: {
            getMessage: (key: string, substitutions?: string | string[]) =>
                [key, ...[substitutions ?? []].flat()].join(" "),
        },
    },
}));

afterEach(cleanup);

// Hover and focus open tooltips through CSS: only their dismissal is observable here.
function isShown(tooltip: HTMLElement): boolean {
    return !tooltip.classList.contains("hidden");
}

describe("Tooltip", () => {
    it("describes a focusable trigger", () => {
        render(<Tooltip content="Details">Value</Tooltip>);
        const tooltip = screen.getByRole("tooltip");
        const trigger = screen.getByText("Value");
        expect(trigger.tabIndex).toBe(0);
        expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
        expect(tooltip.textContent).toBe("Details");
    });

    it("is dismissed with Escape from the keyboard, until focused again", () => {
        render(<Tooltip content="Details">Value</Tooltip>);
        const trigger = screen.getByText("Value");
        const tooltip = screen.getByRole("tooltip");
        fireEvent.focus(trigger);
        expect(isShown(tooltip)).toBe(true);
        fireEvent.keyDown(trigger, { key: "Escape" });
        expect(isShown(tooltip)).toBe(false);
        fireEvent.focus(trigger);
        expect(isShown(tooltip)).toBe(true);
    });

    it("is dismissed with Escape while hovered, wherever the focus is", () => {
        render(<Tooltip content="Details">Value</Tooltip>);
        const trigger = screen.getByText("Value");
        const tooltip = screen.getByRole("tooltip");
        fireEvent.mouseEnter(trigger);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(isShown(tooltip)).toBe(false);
        fireEvent.mouseLeave(trigger);
        fireEvent.mouseEnter(trigger);
        expect(isShown(tooltip)).toBe(true);
    });

    it("ignores Escape once no longer hovered", () => {
        render(<Tooltip content="Details">Value</Tooltip>);
        const trigger = screen.getByText("Value");
        fireEvent.mouseEnter(trigger);
        fireEvent.mouseLeave(trigger);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(isShown(screen.getByRole("tooltip"))).toBe(true);
    });
});

describe("ImpactValue", () => {
    it("shows the median with its range in a tooltip", () => {
        render(
            <ImpactValue
                criterion="energy"
                range={{ min: 0.001, median: 0.002, max: 0.003 }}
                locale="en"
            />,
        );
        expect(screen.getByText(/^2\sWh$/)).toBeTruthy();
        expect(screen.getByRole("tooltip").textContent).toMatch(/^rangeLabel 1\sWh – 3\sWh$/);
    });

    it("has no tooltip for a scalar", () => {
        render(
            <ImpactValue
                criterion="energy"
                range={{ min: 0.002, median: 0.002, max: 0.002 }}
                locale="en"
            />,
        );
        expect(screen.getByText(/^2\sWh$/)).toBeTruthy();
        expect(screen.queryByRole("tooltip")).toBeNull();
    });
});

describe("FlagIcons", () => {
    it("labels each raised flag for screen readers and hides its symbol", () => {
        const { container } = render(
            <FlagIcons flags={{ lowerBound: true, approximatedModel: false }} />,
        );
        expect(screen.getByText("flagLowerBoundTitle", { selector: ".sr-only" })).toBeTruthy();
        expect(screen.queryByText("flagApproximatedTitle", { selector: ".sr-only" })).toBeNull();
        expect(screen.getByText("≥").getAttribute("aria-hidden")).toBe("true");
        expect(screen.getByRole("tooltip").textContent).toBe(
            "flagLowerBoundTitleflagLowerBoundHelp",
        );
        expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    });

    it("renders nothing without raised flags", () => {
        const { container } = render(
            <FlagIcons flags={{ lowerBound: false, approximatedModel: false }} />,
        );
        expect(container.innerHTML).toBe("");
    });
});
