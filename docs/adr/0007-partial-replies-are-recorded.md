# Replies stopped before their end are recorded as partial

A reply the user stops has still been generated up to the stop, so ignoring it would undercount. A stream the page aborts before the provider's completion marker, by the user or by leaving the page, is recorded as a partial reply, estimated with what was streamed and the time until the stop; a stream cut by the network or ending in an error is skipped instead. Replies are deduplicated by the id the web app gives them, keeping the first event, so a stopped reply the web app continues under the same id is counted once, without its continuation.

## Consequences

- Each adapter must tell a page abort from a completed stream: ChatGPT aborts its own request right after its completion marker, which is a complete reply, not a partial one.
- A stopped reply needs a badge anchor too, and web apps may render it unlike a finished one (Gemini shows a stop notice instead of the action bar), so reply markups and DOM snapshots must cover stopped replies.
