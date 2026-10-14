# Adapter fixtures

Response streams of each provider's reply endpoint, replayed by the adapter tests
(`src/adapters/*.test.ts`), which also re-split them into chunks of various sizes.

## Recording a fixture

1. Open the provider in a browser with DevTools → Network, filter on the reply endpoint
   (ChatGPT: `POST /backend-api/f/conversation`).
2. Send a message, then copy the response body (_Response_ tab) into `<provider>/<case>.sse`.
3. Anonymise before committing:
    - replace prompts, replies, titles and search results with neutral text or `REDACTED`
      (keep the text of the reply the test asserts on);
    - replace message, conversation and parent ids with `00000000-0000-4000-8000-…` values;
    - replace tokens (`resume_conversation_token`, `conduit_token`…) with `REDACTED`;
    - drop account details (plan, email, user id) from metadata events.
4. Keep the event structure untouched: field order, `event:` lines, the delta encoding.

## ChatGPT

| File                 | Case                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `normal-reply.sse`   | Delta-encoded (`v1`) reply with user echo and trailing metadata   |
| `thinking-reply.sse` | Thinking model: reasoning summaries, reasoning recap, final reply |
| `regenerate.sse`     | Regenerated reply (`action: "variant"`)                           |
| `tool-call.sse`      | Web search: assistant tool call, tool result, final reply         |
| `snapshots.sse`      | Legacy encoding where each event carries the whole message        |
| `aborted.sse`        | Stream cut before `[DONE]` (user pressed stop)                    |
| `error.sse`          | Server error event mid-stream                                     |

These fixtures were written from the known ChatGPT stream format, not recorded. Replace them
with anonymised recordings as soon as possible: they are what keeps the adapter honest.
