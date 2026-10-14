/**
 * ChatGPT model slug grammar. Kept free of dependencies: the main-world interceptor uses it, and
 * must not bundle EcoLogits.
 *
 * Slugs use dashes for versions and suffix the mode: `gpt-5-1-thinking` is `gpt-5.1` with more
 * reasoning, `gpt-5-2-instant` is `gpt-5.2-chat-latest`, `gpt-5-t-mini` is `gpt-5-mini` with
 * reasoning (also spelled `gpt-5-thinking-mini`), `gpt-5-pro` always reasons, and so do o-series models.
 */

const VERSION = /^gpt-(\d+)-(\d)(?=-|$)/;
const THINKING = /-thinking(?=-|$)/;
const INSTANT_SUFFIX = /-instant$/;
const THINKING_MINI = /-(?:t|thinking)-mini$/;
const O_SERIES = /^o\d/;
const PRO = /(?:^|-)pro(?:-|$)/;

/** Rewrites a normalised ChatGPT slug into its EcoLogits form. */
export function canonicalizeChatGptSlug(slug: string): string {
    return slug
        .replace(VERSION, "gpt-$1.$2")
        .replace(THINKING_MINI, "-mini")
        .replace(THINKING, "")
        .replace(INSTANT_SUFFIX, "-chat-latest");
}

/** Whether the model always reasons before answering. */
export function isChatGptReasoningSlug(slug: string): boolean {
    const normalized = slug.trim().toLowerCase();
    return [O_SERIES, THINKING, THINKING_MINI, PRO].some((re) => re.test(normalized));
}
