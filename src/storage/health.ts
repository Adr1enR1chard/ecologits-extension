import { storage } from "wxt/utils/storage";
import type { AdapterStatus } from "../messaging";
import { WEB_PROVIDERS, type WebProvider } from "../providers/registry";
import { SCHEMA_VERSION, serialize } from "./schema";

type AdapterStatuses = Partial<Record<WebProvider, AdapterStatus>>;

export const adapterStatusItem = storage.defineItem<AdapterStatuses>("local:adapterStatus", {
    fallback: {},
    version: SCHEMA_VERSION,
});

/** Status of an adapter that never reported anything. */
export function emptyStatus(provider: WebProvider): AdapterStatus {
    return { provider, lastSuccessAt: null, lastFailureAt: null, lastError: null };
}

function updateStatus(
    provider: WebProvider,
    update: (status: AdapterStatus) => AdapterStatus,
): Promise<void> {
    return serialize(async () => {
        const statuses = await adapterStatusItem.getValue();
        const current = statuses[provider] ?? emptyStatus(provider);
        await adapterStatusItem.setValue({ ...statuses, [provider]: update(current) });
    });
}

export function recordAdapterSuccess(provider: WebProvider, at: number): Promise<void> {
    return updateStatus(provider, (status) => ({ ...status, lastSuccessAt: at }));
}

export function recordAdapterFailure(
    provider: WebProvider,
    error: string,
    at: number,
): Promise<void> {
    return updateStatus(provider, (status) => ({ ...status, lastFailureAt: at, lastError: error }));
}

/** One status per provider, in {@link WEB_PROVIDERS} order. */
export async function getAdapterStatuses(): Promise<AdapterStatus[]> {
    const statuses = await adapterStatusItem.getValue();
    return WEB_PROVIDERS.map((provider) => statuses[provider] ?? emptyStatus(provider));
}

export type AdapterHealth = "unknown" | "ok" | "failing";

/** An adapter is failing when its last outcome was a failure. */
export function adapterHealth(status: AdapterStatus): AdapterHealth {
    const { lastSuccessAt, lastFailureAt } = status;
    if (lastFailureAt !== null && (lastSuccessAt === null || lastFailureAt > lastSuccessAt)) {
        return "failing";
    }
    return lastSuccessAt === null ? "unknown" : "ok";
}
