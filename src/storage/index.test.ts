import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { impactResult } from "../test-utils";
import { aggregatesItem, getAggregates } from "./aggregates";
import { eventsItem, getEvents } from "./events";
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

describe("schema v2 migration", () => {
    it("flags the events and aggregates stored by v1 as not partial", async () => {
        const v1Flags = { lowerBound: false, approximatedModel: false };
        const v1Aggregate = {
            date: "2026-10-14",
            provider: "chatgpt",
            model: "gpt-5",
            requests: 1,
            outputTokens: 100,
            lowerBoundRequests: 0,
            approximatedModelRequests: 0,
            impacts: impactResult().impacts,
        };
        await fakeBrowser.storage.local.set({
            events: [{ ...impactResult(), flags: v1Flags }],
            events$: { v: 1 },
            aggregates: { "2026-10-14/chatgpt/gpt-5": v1Aggregate },
            aggregates$: { v: 1 },
        });

        await eventsItem.migrate();
        await aggregatesItem.migrate();

        expect((await getEvents())[0]!.flags.partial).toBe(false);
        expect((await getAggregates())["2026-10-14/chatgpt/gpt-5"]!.partialRequests).toBe(0);
    });
});
