import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { impactResult } from "../test-utils";
import { getAggregates } from "./aggregates";
import { getEvents } from "./events";
import { getAdapterStatuses, recordAdapterSuccess } from "./health";
import { clearUsageData, recordImpact } from "./index";
import { getSettings, updateSettings } from "./settings";

beforeEach(() => {
    fakeBrowser.reset();
});

describe("clearUsageData", () => {
    it("deletes aggregates, events and adapter status but keeps settings", async () => {
        await recordImpact(impactResult());
        await recordAdapterSuccess("chatgpt", 1);
        await updateSettings({ showBadge: false });

        await clearUsageData();

        expect(await getAggregates()).toEqual({});
        expect(await getEvents()).toEqual([]);
        expect((await getAdapterStatuses())[0]!.lastSuccessAt).toBeNull();
        expect(await getSettings()).toEqual({ showBadge: false });
    });
});
