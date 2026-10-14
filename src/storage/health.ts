import { storage } from "wxt/utils/storage";
import { WEB_PROVIDERS, type AdapterStatus, type WebProvider } from "../messaging";
import { SCHEMA_VERSION, serialize } from "./schema";

type AdapterStatuses = Partial<Record<WebProvider, AdapterStatus>>;

export const adapterStatusItem = storage.defineItem<AdapterStatuses>("local:adapterStatus", {
    fallback: {},
    version: SCHEMA_VERSION,
});

function emptyStatus(provider: WebProvider): AdapterStatus {
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
