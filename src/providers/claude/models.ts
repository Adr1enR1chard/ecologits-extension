import type { ProviderModels } from "../types";

/**
 * Claude model names, as sent by claude.ai: API IDs, usually dated
 * (`claude-sonnet-4-5-20250929`), sometimes `-latest`, or display labels (`Claude Opus 4.5`).
 * EcoLogits knows the undated IDs with dashed versions (`claude-opus-4-5`).
 */

const SEPARATORS = /[\s_]+/g;
const DOTTED_VERSION = /(\d)\.(\d)/g;
const SUFFIX = /-(?:\d{8}|latest)$/;

/** Rewrites a normalised Claude model name into its EcoLogits form. */
export function canonicalizeClaudeSlug(slug: string): string {
    const id = slug.replace(SEPARATORS, "-").replace(DOTTED_VERSION, "$1-$2").replace(SUFFIX, "");
    return id.startsWith("claude-") ? id : `claude-${id}`;
}

export const claudeModels: ProviderModels = {
    ecologitsProvider: "anthropic",
    // claude.ai only sends the model when it is not the default one.
    fallback: "claude-sonnet-5-5",
    aliases: {},
    proxies: {},
    canonicalize: canonicalizeClaudeSlug,
};

export default claudeModels;
