import { storage } from "wxt/utils/storage";
import { SCHEMA_VERSION } from "./schema";

export interface Settings {
    /** Show the impact badge under each assistant reply. */
    showBadge: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { showBadge: true };

export const settingsItem = storage.defineItem<Partial<Settings>>("local:settings", {
    fallback: {},
    version: SCHEMA_VERSION,
});

/** Stored settings, with defaults for the ones never set. */
export function withDefaults(stored: Partial<Settings>): Settings {
    return { ...DEFAULT_SETTINGS, ...stored };
}

export async function getSettings(): Promise<Settings> {
    return withDefaults(await settingsItem.getValue());
}

export async function updateSettings(update: Partial<Settings>): Promise<void> {
    await settingsItem.setValue({ ...(await settingsItem.getValue()), ...update });
}

/** Calls `callback` with the full settings whenever they change. Returns an unwatch function. */
export function watchSettings(callback: (settings: Settings) => void): () => void {
    return settingsItem.watch((value) => callback(withDefaults(value)));
}
