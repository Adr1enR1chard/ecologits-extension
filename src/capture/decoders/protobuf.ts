/**
 * Schema-less protobuf reader for the messages of provider streams, which may hold anything:
 * fields are read by number, a length-delimited field as a sub-message or a string as the
 * caller expects. Malformed input reads as absent fields, never throws.
 */

interface Field {
    number: number;
    /** Varint fields. */
    varint?: number;
    /** Length-delimited fields. */
    bytes?: Uint8Array;
}

const utf8 = new TextDecoder();

export class ProtoMessage {
    private constructor(private readonly fields: readonly Field[]) {}

    /** Decodes a message, `null` when the bytes are not one. */
    static decode(bytes: Uint8Array): ProtoMessage | null {
        const fields: Field[] = [];
        let pos = 0;
        const varint = (): number | null => {
            let value = 0;
            for (let shift = 0; shift < 64; shift += 7) {
                const byte = bytes[pos++];
                if (byte === undefined) return null;
                value += (byte & 0x7f) * 2 ** shift;
                if (byte < 0x80) return value;
            }
            return null;
        };
        while (pos < bytes.length) {
            const key = varint();
            if (key === null) return null;
            const number = Math.floor(key / 8);
            if (number === 0) return null;
            switch (key % 8) {
                case 0: {
                    const value = varint();
                    if (value === null) return null;
                    fields.push({ number, varint: value });
                    break;
                }
                case 1:
                    pos += 8;
                    break;
                case 2: {
                    const length = varint();
                    if (length === null || pos + length > bytes.length) return null;
                    fields.push({ number, bytes: bytes.subarray(pos, pos + length) });
                    pos += length;
                    break;
                }
                case 5:
                    pos += 4;
                    break;
                default:
                    return null;
            }
        }
        return pos === bytes.length ? new ProtoMessage(fields) : null;
    }

    /** Decodes a base64 message, `null` when the text is not one. */
    static fromBase64(text: string): ProtoMessage | null {
        let binary: string;
        try {
            binary = atob(text);
        } catch {
            return null;
        }
        return ProtoMessage.decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    }

    /** The first sub-message at a path of field numbers, `null` when absent or malformed. */
    message(...path: number[]): ProtoMessage | null {
        return path.reduce<ProtoMessage | null>((message, number) => {
            const bytes = message?.bytes(number) ?? null;
            return bytes && ProtoMessage.decode(bytes);
        }, this);
    }

    /** Every sub-message of a repeated field, skipping malformed ones. */
    messages(number: number): ProtoMessage[] {
        return this.fields
            .filter((f) => f.number === number && f.bytes !== undefined)
            .map((f) => ProtoMessage.decode(f.bytes!))
            .filter((m): m is ProtoMessage => m !== null);
    }

    /** A string field, `null` when absent or empty. */
    string(number: number): string | null {
        const bytes = this.bytes(number);
        return bytes === null || bytes.length === 0 ? null : utf8.decode(bytes);
    }

    /** A varint field, `null` when absent. */
    varint(number: number): number | null {
        return (
            this.fields.find((f) => f.number === number && f.varint !== undefined)?.varint ?? null
        );
    }

    private bytes(number: number): Uint8Array | null {
        return this.fields.find((f) => f.number === number && f.bytes !== undefined)?.bytes ?? null;
    }
}
