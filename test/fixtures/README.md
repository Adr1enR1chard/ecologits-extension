# Adapter fixtures

Response streams of each provider's reply endpoint, replayed by the adapter tests
(`src/providers/*/*.test.ts`), which also re-split them into chunks of various sizes
(`src/capture/adapter-contract.ts`), and DOM snapshots of its conversation page, replayed by the
page tests (`src/providers/*/page.test.ts`).

## Recording a fixture

1. Run `pnpm dev`, open the provider and its DevTools console (top frame), and send a message.
   The interceptor logs `[ecologits] stream recorded …` and keeps the last 5 raw streams, exactly
   as the extension received them (including client-side aborts, which DevTools' Network tab
   often shows as "(canceled)" with no body).
2. Run `copy(__ecologitsStreams.at(-1).text)` and paste into `<provider>/<case>.sse`.
   `__ecologitsStreams.at(-1).end` tells how the stream ended (`done` or the abort error).
3. Anonymise before committing, with `anonymiseStream(provider, text)` from
   `scripts/fixtures/anonymise.ts`, which applies the rules below; the keys it keeps, maps or
   redacts are listed per provider in `scripts/fixtures/providers/`. The text the test asserts on
   can then be restored by hand. `scripts/fixtures/no-personal-data.test.ts` fails if a fixture
   still holds an email address, a UUID not of the zeroed form, or a token. The rules:
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

## DOM snapshots

`<provider>/<case>.html` is the outerHTML of the element holding a conversation's replies, enough
for the badge to find the last one. Snapshots are listed in `src/providers/page-snapshots.ts`
(`PAGE_SNAPSHOTS`), and `src/providers/page-contract.ts` replays them in happy-dom: for the markup
of `PAGES[<provider>]` each one is rendered with, the `reply` selector matches the expected number
of finished replies, `idAttribute` yields the id of the last one, `rendering(root)` is false and
`anchor(id).selector` resolves to exactly one element. Each snapshot also removes what its anchor
depends on (the action bar, or the reply id when the badge follows the reply block) and checks
that the anchor is lost. `src/providers/registry.test.ts` checks that every markup of every
supported provider has a snapshot, replayed by its `page.test.ts`.

Snapshots go through `sanitiseSnapshot(html, ids)` from `scripts/fixtures/snapshot.ts`, and a
committed snapshot is one it leaves unchanged (`scripts/fixtures/snapshot.test.ts`):

- `<script>`, `<style>` and `<link>` are dropped, `<svg>` emptied, comments dropped;
- text, including in `<template>`, and `alt` / `title` / `aria-label` values are masked
  (letters → `x`, digits → `0`);
- UUIDs become zeroed ones; pass the `ZeroedIds` used by `anonymiseStream` for the stream of the
  same case so their message ids match;
- `class` and `role` are kept (selectors rely on them), and so are `data-*` and `id` when their
  value is one short lower case identifier or a list of UUIDs; any other value may be text or
  hold a token, and is masked. Every other attribute (inline `style`, `href`, `src`…) is dropped.

Snapshots are kept as recorded: Prettier ignores them.

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
| `normal-reply.html`         | **Synthetic** DOM snapshot, logged-in markup: two turns, each reply block (`data-chatgpt-selection-message-id`) followed by its action bar; last reply id from `normal-reply.sse`                                                                          |
| `logged-out-reply.html`     | **Synthetic** DOM snapshot, logged-out markup: `<li data-message-role>` per message, the assistant one ending with `[data-assistant-message-actions]`; reply id from `logged-out-reply.ndjson`                                                             |

## Claude

| File                | Case                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `normal-reply.sse`  | **Recorded.** Reply (`claude-sonnet-5-5`): `ping` and `conversation_ready` keep-alives, one text block, `message_limit` (account usage neutralised), `message_stop`                                          |
| `tool-call.sse`     | **Recorded.** Reply with a tool call (`weather_fetch`): `tool_use` input streamed as `input_json_delta`, `tool_result` from the server, then the text. The location is replaced with `REDACTED` and `0.0000` |
| `aborted.sse`       | **Recorded.** Reply with thinking, stopped by the user: the thinking block only streams a summary (`thinking_summary_delta`), then the text ends mid-block, without `message_stop`                           |
| `normal-reply.html` | **Synthetic** DOM snapshot: two finished `[data-testid="assistant-message"]` replies, each ending with the wrapper of `[data-testid="message-actions"]`; last reply id from `normal-reply.sse`               |

The streams stopped by the user ended with an `AbortError`, which the recording does not keep:
tests replay them as aborted (`finish("aborted")`) to get a partial reply, and as `done` or
`failed` to check that a stream cut without abort is skipped.

Fixtures not marked **Recorded** were written from the known stream
format or, for DOM snapshots, from the comments in each `page.ts`, not recorded. Replace them
with anonymised recordings as soon as possible: they are what keeps the adapter honest.
