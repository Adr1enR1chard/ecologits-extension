export type ColorScheme = "light" | "dark";

/** Lightness of a computed CSS color, from 0 (black) to 1 (white); `null` when not parsed. */
export function lightness(color: string): number | null {
    const match = /^(\w+)\((.*)\)$/.exec(color.trim());
    if (!match) return null;
    const [, fn, args = ""] = match;
    const parts = args.split(/[\s,/]+/).filter(Boolean);
    const num = (part: string | undefined, scale: number) =>
        part === undefined
            ? NaN
            : part.endsWith("%")
              ? parseFloat(part) / 100
              : parseFloat(part) / scale;
    let value: number;
    switch (fn) {
        case "rgb":
        case "rgba": {
            // Relative luminance, then perceived lightness (CIE L*) so 0.5 is a mid gray.
            const [r, g, b] = [0, 1, 2].map((i) => {
                const c = num(parts[i], 255);
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            }) as [number, number, number];
            const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            value = (y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16) / 100;
            break;
        }
        case "oklch":
        case "oklab":
            value = num(parts[0], 1);
            break;
        case "lch":
        case "lab":
            value = num(parts[0], 100);
            break;
        default:
            return null;
    }
    return Number.isNaN(value) ? null : value;
}

/** Theme of a page from the color of its text: light text means a dark page. */
export function schemeOfText(color: string): ColorScheme {
    return (lightness(color) ?? 0) > 0.5 ? "dark" : "light";
}
