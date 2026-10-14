import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { getSettings, updateSettings, watchSettings } from "./settings";

beforeEach(() => {
    fakeBrowser.reset();
});

describe("settings", () => {
    it("default to showing the badge", async () => {
        expect(await getSettings()).toEqual({ showBadge: true });
    });

    it("persist updates and notify watchers with full settings", async () => {
        const callback = vi.fn();
        const unwatch = watchSettings(callback);
        await updateSettings({ showBadge: false });
        expect(await getSettings()).toEqual({ showBadge: false });
        await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({ showBadge: false }));
        unwatch();
    });
});
