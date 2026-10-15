import { isRecord } from "../messaging";

/** Helpers to read the JSON of provider streams and requests, which may hold anything. */

export function isObject(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && !Array.isArray(value);
}

/** The value if it is a non-empty string, otherwise `null`. */
export function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/** The `model` field of a JSON request body, `null` when absent or unreadable. */
export function requestedModel(body: string | null): string | null {
    if (body === null) return null;
    try {
        const parsed: unknown = JSON.parse(body);
        return isObject(parsed) ? stringOrNull(parsed.model) : null;
    } catch {
        return null;
    }
}
