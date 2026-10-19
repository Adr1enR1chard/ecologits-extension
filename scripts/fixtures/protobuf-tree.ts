/**
 * A schema-less protobuf codec for rewriting recorded messages: a message decodes into its fields
 * as written and encodes back byte for byte, so only the fields rewritten change. Without the
 * schema, a length-delimited field is read as a sub-message when its bytes are one, else as a
 * string when they are UTF-8, else as bytes.
 */

export interface ProtoField {
    number: number;
    /** 0 varint, 1 fixed64, 2 length-delimited, 5 fixed32. */
    wire: 0 | 1 | 2 | 5;
    /** The field's key, as written. */
    key: Uint8Array;
    /** The varint as written, the fixed bytes, or the bytes of a length-delimited field. */
    value: Uint8Array;
}

/** The fields of a message, `null` when the bytes are not one (groups included). */
export function decodeMessage(bytes: Uint8Array): ProtoField[] | null {
    const fields: ProtoField[] = [];
    let pos = 0;
    /** The varint at `pos`, `null` when cut or longer than 10 bytes. */
    const varint = (): number | null => {
        let value = 0;
        for (let shift = 0; shift < 70; shift += 7) {
            const byte = bytes[pos++];
            if (byte === undefined) return null;
            value += (byte & 0x7f) * 2 ** shift;
            if (byte < 0x80) return value;
        }
        return null;
    };
    while (pos < bytes.length) {
        const keyStart = pos;
        const key = varint();
        if (key === null) return null;
        const number = Math.floor(key / 8);
        const wire = key % 8;
        if (number === 0) return null;
        const valueStart = pos;
        let valueEnd: number;
        switch (wire) {
            case 0:
                if (varint() === null) return null;
                valueEnd = pos;
                break;
            case 1:
            case 5:
                valueEnd = pos + (wire === 1 ? 8 : 4);
                break;
            case 2: {
                const length = varint();
                if (length === null) return null;
                valueEnd = pos + length;
                break;
            }
            default:
                return null;
        }
        if (valueEnd > bytes.length) return null;
        fields.push({
            number,
            wire,
            key: bytes.subarray(keyStart, valueStart),
            value: bytes.subarray(wire === 2 ? pos : valueStart, valueEnd),
        });
        pos = valueEnd;
    }
    return fields;
}

/** The bytes of a message, each length-delimited field prefixed with its value's length. */
export function encodeMessage(fields: readonly ProtoField[]): Uint8Array {
    const parts = fields.flatMap(({ wire, key, value }) =>
        wire === 2 ? [key, encodeVarint(value.length), value] : [key, value],
    );
    const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let pos = 0;
    for (const part of parts) {
        bytes.set(part, pos);
        pos += part.length;
    }
    return bytes;
}

export function encodeVarint(value: number): Uint8Array {
    const bytes: number[] = [];
    while (value >= 0x80) {
        bytes.push((value % 0x80) | 0x80);
        value = Math.floor(value / 0x80);
    }
    bytes.push(value);
    return Uint8Array.from(bytes);
}

/** The fields of a length-delimited value read as a sub-message, `null` when it is not one. */
export function asMessage(bytes: Uint8Array): ProtoField[] | null {
    return bytes.length === 0 ? null : decodeMessage(bytes);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** A length-delimited value read as a string, `null` when it is not UTF-8. */
export function asString(bytes: Uint8Array): string | null {
    try {
        return utf8.decode(bytes);
    } catch {
        return null;
    }
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** The bytes of a base64 message, `null` when the text is not base64 of a non-empty message. */
export function fromBase64(text: string): Uint8Array | null {
    if (text === "" || !BASE64.test(text)) return null;
    const bytes = new Uint8Array(Buffer.from(text, "base64"));
    return decodeMessage(bytes) === null ? null : bytes;
}

export function toBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}
