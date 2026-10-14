import { toLocalDate } from "../storage/aggregates";

/** File name for an export, e.g. `ecologits-aggregates-2026-10-14.csv`. */
export function exportFileName(kind: string, extension: string, now: number = Date.now()): string {
    return `ecologits-${kind}-${toLocalDate(now)}.${extension}`;
}

/** Saves `content` as a file through the browser's download flow. */
export function downloadFile(fileName: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
