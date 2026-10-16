import type { Providers } from "@ecologits/ecologits.js";

/**
 * Contracts each provider folder fills in, one file per execution context: `meta.ts` everywhere,
 * `capture.ts` in the main-world interceptor (see `ProviderCapture`), `models.ts` in the
 * background, `page.ts` in the bridge content script. Keeping them apart keeps EcoLogits and DOM
 * code out of the interceptor bundle.
 */

/** What every context may know about a provider. Dependency-free. */
export interface ProviderMeta {
    /** Stored with every result and adapter status: never rename. */
    id: string;
    name: string;
    /** Hostnames the web app is served from. */
    hosts: readonly string[];
    /** `"planned"` providers are only announced in the popup. */
    status: "supported" | "planned";
    /**
     * SVG path of the company's monochrome mark (24 × 24), from Simple Icons
     * (https://simpleicons.org, CC0), only to name the service.
     */
    logo: string;
}

/**
 * A web model that may be any of several EcoLogits models: its impacts span from the low bound
 * of `low` to the high bound of `high`.
 */
export interface ModelRange {
    low: string;
    high: string;
}

/** How the web models of a provider map to EcoLogits models. */
export interface ProviderModels {
    ecologitsProvider: Providers;
    /** EcoLogits model used when the web model is unknown or not exposed. */
    fallback: string;
    /** Normalised web slug → EcoLogits model ID, for slugs EcoLogits does not know as-is. */
    aliases: Readonly<Record<string, string>>;
    /**
     * Normalised web slug → EcoLogits models bracketing a web model EcoLogits does not know.
     * Always approximated.
     */
    ranges?: Readonly<Record<string, ModelRange>>;
    /** Rewrites a normalised web slug into its EcoLogits form, tried after the aliases. */
    canonicalize?: (slug: string) => string;
}

/** Where a badge goes: next to the element matched by `selector`. */
export interface ReplyAnchor {
    selector: string;
    position: "after" | "before";
}

/** One way the web app renders assistant replies. */
export interface ReplyMarkup {
    /** Matches the element of any finished reply. */
    reply: string;
    /** Attribute holding the message id of a reply element. */
    idAttribute: string;
    /** Attributes whose change may make an element match `reply`. */
    attributes: readonly string[];
    /** The latest reply is still being rendered: the last finished one is an older reply. */
    rendering?(root: ParentNode): boolean;
    /** Where the badge of the reply with that (CSS-escaped) id goes. */
    anchor(escapedId: string): ReplyAnchor;
}

/** How the web app renders replies and conversations, for the badge. */
export interface ProviderPage {
    /** Newest markup first. */
    markups: readonly ReplyMarkup[];
    /** Whether a path is a conversation without id yet: it gets one during its first reply. */
    isNewConversation(path: string): boolean;
}
