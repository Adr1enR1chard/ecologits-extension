// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { healthyStatuses, sampleAggregates, sampleStatuses } from "../gallery/samples";
import { Popup } from "./App";

// Messages are their key followed by their substitutions.
vi.mock("wxt/browser", () => ({
    browser: {
        i18n: {
            getMessage: (key: string, substitutions?: string | string[]) =>
                key === "messagesLocale" || key === "@@ui_locale"
                    ? "en"
                    : [key, ...[substitutions ?? []].flat()].join(" "),
            getUILanguage: () => "en",
        },
        runtime: { openOptionsPage: vi.fn() },
    },
}));

// Noon, so that the sample replies of the last hours are all today.
const NOW = new Date(2026, 9, 14, 12).getTime();

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

/** The text an element gives screen readers, without the tooltips it holds. */
function accessibleText(element: Element): string {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll("[role='tooltip']").forEach((tooltip) => tooltip.remove());
    return (element.getAttribute("aria-label") ?? clone.textContent ?? "").trim();
}

describe("Popup", () => {
    it("names every control and hides every icon from screen readers", () => {
        const { container } = render(
            <Popup aggregates={sampleAggregates(NOW)} statuses={sampleStatuses(NOW)} />,
        );
        container.querySelectorAll("details").forEach((details) => (details.open = true));
        container
            .querySelectorAll<HTMLElement>("button[aria-expanded='false']")
            .forEach((button) => fireEvent.click(button));

        const controls = container.querySelectorAll("button, summary, [tabindex='0']");
        expect(controls.length).toBeGreaterThan(20);
        for (const control of controls) expect(accessibleText(control)).not.toBe("");
        for (const svg of container.querySelectorAll("svg")) {
            expect(svg.getAttribute("aria-hidden")).toBe("true");
        }
    });

    it("explains the counts, the caveats, the equivalences and the capture statuses in tooltips", () => {
        render(<Popup aggregates={sampleAggregates(NOW)} statuses={sampleStatuses(NOW)} />);
        const tooltips = screen.getAllByRole("tooltip").map((t) => t.textContent);
        expect(tooltips).toContain("repliesCount 7");
        expect(tooltips).toContain("flagLowerBoundHelp");
        expect(tooltips.some((t) => t?.startsWith("≈ equivalenceCarKm"))).toBe(true);
        expect(tooltips.some((t) => t?.startsWith("ClaudeadapterFailing"))).toBe(true);
        expect(tooltips).toContain("equivalencesSource");
    });

    it("only shows the flags raised over the period", () => {
        render(
            <Popup
                aggregates={sampleAggregates(NOW, ["chatgpt"])}
                statuses={healthyStatuses(NOW)}
            />,
        );
        expect(screen.getByText(/^popupLowerBoundCount/)).toBeTruthy();
        expect(screen.queryByText(/^popupApproximatedCount/)).toBeNull();
    });

    it("shows the usage-only criteria up front, and not again in the details", () => {
        const { container } = render(
            <Popup aggregates={sampleAggregates(NOW)} statuses={sampleStatuses(NOW)} />,
        );
        expect(screen.getByText("criterionWcfShort")).toBeTruthy();
        const details = [...container.querySelectorAll("details")].find((d) =>
            d.textContent?.includes("detailsTitle"),
        )!;
        expect(details.textContent).toContain("criterionPe");
        expect(details.textContent).not.toContain("criterionWcf");
        expect(details.textContent).not.toContain("criterionEnergy");
    });

    it("names the criterion of every breakdown value", () => {
        const { container } = render(
            <Popup
                aggregates={sampleAggregates(NOW, ["chatgpt"])}
                statuses={healthyStatuses(NOW)}
            />,
        );
        const row = container.querySelector("button[aria-expanded]")!.closest("div")!;
        expect(accessibleText(row)).toMatch(/criterionEnergy: .+criterionGwp: .+criterionWcf: /);
    });

    it("folds the models of each provider, unless there is a single one", () => {
        render(<Popup aggregates={sampleAggregates(NOW)} statuses={sampleStatuses(NOW)} />);
        const buttons = screen.getAllByRole("button", { expanded: false });
        expect(buttons.map(accessibleText)).toEqual([
            "Claude, repliesCount 2",
            "ChatGPT, repliesCount 3",
            "Gemini, repliesCount 2",
        ]);
        expect(screen.queryByText("claude-opus-5-5")).toBeNull();
        fireEvent.click(buttons[0]!);
        expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByText("claude-opus-5-5")).toBeTruthy();
        expect(screen.queryByText("gpt-5-mini")).toBeNull();

        cleanup();
        render(
            <Popup
                aggregates={sampleAggregates(NOW, ["chatgpt"])}
                statuses={healthyStatuses(NOW)}
            />,
        );
        expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
        expect(screen.getByText("gpt-5-mini")).toBeTruthy();
    });

    it("unfolds a provider left alone by new data", () => {
        const { rerender } = render(
            <Popup aggregates={sampleAggregates(NOW)} statuses={healthyStatuses(NOW)} />,
        );
        expect(screen.queryByRole("button", { expanded: true })).toBeNull();
        rerender(
            <Popup
                aggregates={sampleAggregates(NOW, ["chatgpt"])}
                statuses={healthyStatuses(NOW)}
            />,
        );
        expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
    });

    it("opens the settings", () => {
        render(<Popup aggregates={{}} statuses={{}} />);
        fireEvent.click(screen.getByRole("button", { name: "openOptions" }));
        expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
    });

    it("says when nothing was recorded", () => {
        render(<Popup aggregates={{}} statuses={{}} />);
        expect(screen.getByText("popupEmpty")).toBeTruthy();
        expect(screen.queryByText("breakdownTitle")).toBeNull();
    });
});
