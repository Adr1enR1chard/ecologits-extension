# Replies stopped before their end are recorded as partial

A reply the user stops has still been generated up to the stop, so ignoring it would undercount.
A stream the page aborts before the provider's completion marker is recorded as a partial reply,
estimated with what was streamed and the time until the stop; a stream cut by the network or
ending in an error is skipped instead. Leaving the page mid-reply aborts the request too and is
counted the same way. Replies are deduplicated by message id keeping the first event, so a
stopped reply the web app continues under the same id is counted once, without its continuation.

## Consequences

- Each adapter must tell a page abort from a completed stream: ChatGPT aborts its own request
  right after its completion marker, which is a complete reply, not a partial one.
- Storage schema v2 added the `partial` flag to events and a partial count to daily aggregates.
