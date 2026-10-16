/** What personal data looks like in a fixture, and how text is masked to remove it. */

export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The only UUIDs fixtures may hold: `00000000-0000-4000-8000-` then a counter. */
const ZEROED_UUID = /^00000000-0000-4000-8000-[0-9a-f]{12}$/i;

export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g;

/** Runs of base64 (or base64url) characters long enough to be a token or a key. */
const BASE64_RUN = /[A-Za-z0-9+/_=-]{40,}/g;

/**
 * A base64 run mixing many upper case letters, lower case letters and digits, as random tokens
 * do (a 40 character one holds about 16, 16 and 6). Masked text only holds `x` and `0`, zeroed
 * ids no upper case, and camelCase paths (`/message/metadata/model_dil_v2/…`) few.
 */
function isRandomBase64(run: string): boolean {
    const count = (pattern: RegExp) => run.match(pattern)?.length ?? 0;
    return count(/[A-Z]/g) >= 5 && count(/[a-z]/g) >= 5 && count(/\d/g) >= 3;
}

/** Whether a whole value is a token: a JWT or a random base64 run. */
export function looksLikeToken(value: string): boolean {
    const trimmed = value.trim();
    if (new RegExp(`^${JWT.source}$`).test(trimmed)) return true;
    return new RegExp(`^${BASE64_RUN.source}$`).test(trimmed) && isRandomBase64(trimmed);
}

/** The `n`th zeroed UUID, from 1. */
export function zeroedUuid(n: number): string {
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/**
 * Maps each id to a zeroed UUID, the same id always to the same one (case-insensitively). Share
 * one between the stream and the DOM snapshot of a case so their ids still match.
 */
export class ZeroedIds {
    private readonly ids = new Map<string, string>();

    map(id: string): string {
        const known = id.toLowerCase();
        let mapped = this.ids.get(known);
        if (mapped === undefined) {
            mapped = zeroedUuid(this.ids.size + 1);
            this.ids.set(known, mapped);
        }
        return mapped;
    }

    /** `text` with each UUID it holds mapped. */
    mapUuids(text: string): string {
        return text.replace(UUID, (uuid) => this.map(uuid));
    }
}

/**
 * Masks text: letters become `x` and digits `0`, keeping punctuation, spaces and the length
 * (in UTF-16 code units), so masked fragments still concatenate to their masked whole. The `@`
 * of email addresses becomes `x` too, so they no longer read as addresses.
 */
export function maskText(text: string): string {
    const masked = text
        .replace(/\p{L}/gu, (letter) => "x".repeat(letter.length))
        .replace(/\p{N}/gu, (digit) => "0".repeat(digit.length));
    return masked.replace(EMAIL, (email) => email.replace("@", "x"));
}

/** `text` masked, except its UUIDs, which are mapped. */
export function maskAround(text: string, ids: ZeroedIds): string {
    let masked = "";
    let last = 0;
    for (const match of text.matchAll(UUID)) {
        masked += maskText(text.slice(last, match.index)) + ids.map(match[0]);
        last = match.index + match[0].length;
    }
    return masked + maskText(text.slice(last));
}

export type PersonalDataKind = "email" | "uuid" | "jwt" | "base64";

export interface PersonalDataMatch {
    kind: PersonalDataKind;
    match: string;
}

/** Everything in `text` that looks like personal data, in order of kind. */
export function findPersonalData(text: string): PersonalDataMatch[] {
    const found = (kind: PersonalDataKind, matches: Iterable<RegExpMatchArray>) =>
        [...matches].map((m) => ({ kind, match: m[0] }));
    return [
        ...found("email", text.matchAll(EMAIL)),
        ...found("uuid", text.matchAll(UUID)).filter((m) => !ZEROED_UUID.test(m.match)),
        ...found("jwt", text.matchAll(JWT)),
        ...found("base64", text.matchAll(BASE64_RUN)).filter((m) => isRandomBase64(m.match)),
    ];
}
