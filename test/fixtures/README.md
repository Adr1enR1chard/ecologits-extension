# Adapter fixtures

Response streams of each provider's reply endpoint, replayed by the adapter tests
(`src/providers/*/*.test.ts`), which also re-split them into chunks of various sizes
(`src/capture/adapter-contract.ts`).

## Recording a fixture

1. Run `pnpm dev`, open the provider and its DevTools console (top frame), and send a message.
   The interceptor logs `[ecologits] stream recorded …` and keeps the last 5 raw streams, exactly
   as the extension received them (including client-side aborts, which DevTools' Network tab
   often shows as "(canceled)" with no body).
2. Run `copy(__ecologitsStreams.at(-1).text)` and paste into `<provider>/<case>.sse`.
   `__ecologitsStreams.at(-1).end` tells how the stream ended (`done` or the abort error).
3. Anonymise before committing:
    - replace prompts, replies, titles and search results with neutral text or `REDACTED`
      (keep the text of the reply the test asserts on);
    - replace message, conversation and parent ids with `00000000-0000-4000-8000-…` values;
    - replace tokens (`resume_conversation_token`, `conduit_token`…) with `REDACTED`;
    - drop account details (plan, email, user id) from metadata events.
4. Keep the event structure untouched: field order, `event:` lines, the delta encoding.
5. Long recordings can be masked instead of rewritten: every text value (prompt, reply,
   reasoning, search results, URLs, titles, DIL code) has its letters replaced by `x` and its
   digits by `0`, keeping punctuation, spaces and lengths, so fragments still concatenate to
   their merged message. Structural values (`content_type`, `role`, `status`, `p`, `o`, model
   slugs…) are kept. Tests on masked fixtures assert lengths, ids and flags rather than text.

## ChatGPT

| File                        | Case                                                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal-reply.sse`          | **Recorded.** Logged-in reply (`gpt-6`, instant): user echo, hidden system messages, delta-encoded reply, trailing metadata, `[DONE]`                                                                                                                      |
| `thinking-reply.sse`        | **Recorded, masked.** Logged-in reply with web search and reasoning: tool call (`web.run`), tool results, reasoning summaries, reasoning recap, and the answer streamed both as hidden fragments (`is_message_fragment`) and as the visible merged message |
| `regenerate.sse`            | **Recorded, masked.** Logged-in regenerated reply: `message_type: "variant"`, no user message echo                                                                                                                                                         |
| `tool-call.sse`             | Synthetic complement: tool call carrying code text (the recorded `web.run` call has empty parts)                                                                                                                                                           |
| `aborted.sse`               | **Recorded, masked.** Logged-in reply stopped by the user: the stream ends mid-patch, without `message_stream_complete` nor `[DONE]`                                                                                                                       |
| `logged-out-reply.ndjson`   | **Recorded.** Logged-out reply from `/unauth-mweb/conversation/updates` (NDJSON); the safety HTML partial of the last `shared` line was trimmed                                                                                                            |
| `logged-out-stopped.ndjson` | **Recorded.** Logged-out reply stopped by the user: `append` lines, then the stream just ends (no `terminal-received`, no `end`)                                                                                                                           |

## Claude

| File               | Case                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `normal-reply.sse` | **Recorded.** Reply (`claude-sonnet-5-5`): `ping` and `conversation_ready` keep-alives, one text block, `message_limit` (account usage neutralised), `message_stop`                                          |
| `tool-call.sse`    | **Recorded.** Reply with a tool call (`weather_fetch`): `tool_use` input streamed as `input_json_delta`, `tool_result` from the server, then the text. The location is replaced with `REDACTED` and `0.0000` |
| `aborted.sse`      | **Recorded.** Reply with thinking, stopped by the user: the thinking block only streams a summary (`thinking_summary_delta`), then the text ends mid-block, without `message_stop`                           |

Fixtures not marked **Recorded** were written from the known stream
format, not recorded. Replace them
with anonymised recordings as soon as possible: they are what keeps the adapter honest.
