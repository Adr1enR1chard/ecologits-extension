import { POPUP_SURFACES } from "../entrypoints/gallery/surfaces";
import { EDGE_MARGIN } from "../src/ui/keepInBounds";
import { expect, test } from "./fixtures";

// The popup window takes the width of its content, up to 800 pixels: anything overflowing `main` on
// the right widens it, on the left it is cut off. A viewport as wide as the popup could hide that:
// the window grows as soon as the content is measured, so the viewport cannot be the limit. The
// layout is checked against `main` instead, in a viewport as wide as the popup can grow. Tall
// enough not to scroll, which would take room for a scrollbar.
test.use({ viewport: { width: 800, height: 2000 } });

/** Boxes are laid out in 1/64 pixels: a tooltip placed at the margin can land a unit past it. */
const ROUNDING = 0.1;

for (const lang of ["en", "fr"]) {
    for (const surface of POPUP_SURFACES) {
        test(`${surface} (${lang}) fits the popup width, its tooltips included`, async ({
            page,
            extensionId,
        }) => {
            await page.goto(
                `chrome-extension://${extensionId}/gallery.html?surface=${surface}&lang=${lang}`,
            );
            const main = page.locator("main");
            const unknown = page.getByText(/^Unknown surface/);
            await main.or(unknown).waitFor();
            await expect(unknown).toHaveCount(0);

            // Everything unfolded, so that every tooltip is rendered.
            await page.evaluate(() =>
                document.querySelectorAll("details").forEach((details) => (details.open = true)),
            );
            const folded = page.locator("button[aria-expanded=false]");
            while ((await folded.count()) > 0) {
                const button = (await folded.first().elementHandle())!;
                await button.click();
                // A button that stays folded would be clicked forever.
                await expect
                    .poll(() => button.getAttribute("aria-expanded"), {
                        message: `"${await button.textContent()}" unfolds when clicked`,
                    })
                    .toBe("true");
            }
            await page.mouse.move(0, 0);

            const overflow = () =>
                main.evaluate((element) => element.scrollWidth - element.clientWidth);
            expect(await overflow(), "overflow with the tooltips closed").toBe(0);

            const tooltips = await page.getByRole("tooltip", { includeHidden: true }).all();
            expect(tooltips.length).toBeGreaterThan(0);
            const mainBox = (await main.boundingBox())!;
            for (const tooltip of tooltips) {
                await tooltip.locator("..").hover();
                await expect(tooltip).toBeVisible();
                const text = await tooltip.textContent();
                const box = (await tooltip.boundingBox())!;
                expect
                    .soft(box.x, `left edge of "${text}"`)
                    .toBeGreaterThanOrEqual(mainBox.x + EDGE_MARGIN - ROUNDING);
                expect
                    .soft(box.x + box.width, `right edge of "${text}"`)
                    .toBeLessThanOrEqual(mainBox.x + mainBox.width - EDGE_MARGIN + ROUNDING);
                expect.soft(await overflow(), `overflow with "${text}" open`).toBe(0);
                await page.mouse.move(0, 0);
                await expect(tooltip).toBeHidden();
            }
        });
    }
}
