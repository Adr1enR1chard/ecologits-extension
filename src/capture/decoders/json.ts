import { isRecord } from "../../messaging";

/** Helpers to read the JSON of provider streams and requests, which may hold anything. */

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
    return isRecord(value) && !Array.isArray(value);
}

/** The value if it is a non-empty string, otherwise `null`. */
export function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Parses a JSON object, `null` when the text is not JSON (keep-alives, truncated lines…) or not
 * an object.
 */
export function parseJson(text: string): JsonObject | null {
    try {
        const parsed: unknown = JSON.parse(text);
        return isObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** The `model` field of a JSON request body, `null` when absent or unreadable. */
export function requestedModel(body: string | null): string | null {
    return body === null ? null : stringOrNull(parseJson(body)?.model);
}
