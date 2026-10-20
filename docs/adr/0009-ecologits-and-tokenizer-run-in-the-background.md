# EcoLogits and the tokenizer run only in the background

EcoLogits' model data and the `o200k_base` tokenizer weigh about 2 MB, while content scripts are injected into every provider page and extension pages open on each click. So both run only in the background service worker: the interceptor sends reply text there, which resolves the model, counts the tokens, estimates the reply and returns the estimate for the badge. The cost is a round trip per reply and reply text crossing to the background (counted, never stored, see ADR-0004).

## Consequences

- Content scripts, the popup and the options page must not import `@ecologits/ecologits.js` at runtime: its version is copied into `src/impacts/version.ts`, which a test keeps in sync.
