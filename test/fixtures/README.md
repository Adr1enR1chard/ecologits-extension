# Adapter fixtures

Response streams of each provider's reply endpoint, and DOM snapshots of its conversation page.
They are tested in `test/`, the tool that anonymises them is in `scripts/fixtures/`:

- `test/recorded-cases.test.ts` lists every recorded stream (`CASES`) with a URL of its reply
  endpoint and replays it with that endpoint's parser: the outcome must be the one the case is
  recorded for (a reply, a partial one or a skip), with an output and a message id for a reply,
  a partial stream cut without abort must be skipped, and a case's `check` tells the stream
  still is that case (a web search, a tool call…). It also runs the adapter contract
  (`src/capture/adapter-contract.ts`: re-split into chunks of various sizes, truncated, noise) on
  the streams of each endpoint.
- `test/committed-fixtures.test.ts` checks that no fixture holds personal data and that every
  DOM snapshot is already sanitised.
- The page tests (`src/providers/*/page.test.ts`) replay the DOM snapshots.

No test asserts a recorded value (text, id, model, length): recording a case again only breaks a
test when the code no longer handles it. Each parser's rules are tested on synthetic streams, in
`src/providers/<id>/*.test.ts`.

## Recording a fixture

Fixtures are recorded by hand. Run `pnpm dev`, open the provider and its DevTools console (top
frame), and do what the case's **To record** line below says (send a message, press Stop, turn on
thinking…): the interceptor logs `[ecologits] stream recorded …` and keeps the last 5
raw streams in `__ecologitsStreams`, exactly as the extension received them, including client-side
aborts, which DevTools' Network tab often shows as "(canceled)" with no body.
`copy(__ecologitsStreams.at(-1).text)` copies the last one, and its `end` tells how it ended
(`done` or the abort error). Paste it in `<provider>/<file>`. For the DOM snapshot, once the reply
has finished, `copy(document.body.outerHTML)` and paste it in `<provider>/<case>.html`. Then run:

```sh
pnpm fixtures:anonymise <provider> test/fixtures/<provider>/<file> [test/fixtures/<provider>/<case>.html]
```

It anonymises the stream in place (`anonymiseStream`) and, when given, cuts the page down to the
element holding the replies and sanitises it (`sanitiseSnapshot`) with the stream's ids, so that
the snapshot's last reply keeps the stream's message id. It says when the page holds no finished
reply as `PAGES[<provider>]` finds it: the snapshot is then the whole body, to trim by hand.

Then check the diff, run `pnpm test`, update the tables below, list a new stream in `CASES` and a
new snapshot in `PAGE_SNAPSHOTS`. `__ecologitsStreams` only exists in development builds: the CI `build` job fails
if the production zip holds `__ecologitsStreams` or `stream recorded`.

Anonymising applies the rules below; the keys it keeps, maps or redacts are listed per provider in
`scripts/fixtures/providers/`. `test/committed-fixtures.test.ts` fails if a fixture
still holds an email address, a UUID not of the zeroed form, or a token. The rules, for fixtures
written or edited by hand too:

- replace prompts, replies, titles and search results with neutral text or `REDACTED`;
- replace message, conversation and parent ids with `00000000-0000-4000-8000-…` values, in keys
  too (`componentResults` is keyed by component id);
- replace tokens (`resume_conversation_token`, `conduit_token`…) with `REDACTED`;
- drop account details (plan, email, user id) from metadata events;
- keep the event structure untouched: field order, `event:` lines, the delta encoding.

Long recordings can be masked instead of rewritten: every text value (prompt, reply, reasoning,
search results, URLs, titles, DIL code) has its letters replaced by `x` and its digits by `0`,
keeping punctuation, spaces and lengths, so fragments still concatenate to their merged message.
Structural values (`content_type`, `role`, `status`, `p`, `o`, model slugs…) are kept.

## DOM snapshots

`<provider>/<case>.html` is the outerHTML of the element holding a conversation's replies, enough
for the badge to find the last one: `pnpm fixtures:anonymise` keeps the innermost element holding
the replies and the last one's anchor (its parent when that is the reply itself). Snapshots are
listed in `src/providers/page-snapshots.ts` (`PAGE_SNAPSHOTS`), and
`src/providers/page-contract.ts` replays them in happy-dom: for the markup of `PAGES[<provider>]`
each one is rendered with, the `reply` selector finds a last finished reply with an
`idAttribute`, `rendering(root)` is false and `anchor(id).selector` resolves to exactly one
element. Each snapshot also removes what its anchor depends on (the action bar, or the reply id
when the badge follows the reply block) and checks that the anchor is lost. `src/providers/registry.test.ts` checks that every markup of every
supported provider has a snapshot, replayed by its `page.test.ts`.

Snapshots go through `sanitiseSnapshot(html, ids)` from `scripts/fixtures/snapshot.ts`, and a
committed snapshot is one it leaves unchanged (`test/committed-fixtures.test.ts`):

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
| `logged-out-reply.ndjson`   | **Recorded, masked.** Logged-out reply from `/unauth-mweb/conversation/updates` (NDJSON)                                                                                                                                                                   |
| `logged-out-stopped.ndjson` | **Recorded, masked.** Logged-out reply stopped by the user: `append` lines, then the stream just ends (no `terminal-received`, no `end`)                                                                                                                   |
| `normal-reply.html`         | **Synthetic** DOM snapshot, logged-in markup: two turns, each reply block (`data-chatgpt-selection-message-id`) followed by its action bar; last reply id from `normal-reply.sse`                                                                          |
| `logged-out-reply.html`     | **Recorded** DOM snapshot, logged-out markup: `<li data-message-role>` per message, the assistant one ending with `[data-assistant-message-actions]`                                                                                                       |
| `logged-out-stopped.html`   | **Recorded** DOM snapshot, logged-out markup, of the reply stopped by the user                                                                                                                                                                             |

To record:

- `logged-out-reply`: log out, send a short message and wait for the whole reply;
- `logged-out-stopped`: log out, ask a long question and press Stop mid-reply;
- `normal-reply`: pick an Instant model, send a short message and wait for the whole reply;
- `thinking-reply`: pick a Thinking model, ask a question that needs a web search and wait for
  the whole reply;
- `regenerate`: open a conversation from the sidebar, regenerate its last reply (Try again) and
  wait for the whole reply;
- `tool-call`: ask for a chart of a few numbers, so that ChatGPT runs code, and wait for the whole
  reply;
- `aborted`: ask a long question and press Stop mid-reply.

## Claude

| File                | Case                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `normal-reply.sse`  | **Recorded.** Reply (`claude-sonnet-5-5`): `ping` and `conversation_ready` keep-alives, one text block, `message_limit` (account usage neutralised), `message_stop`                                          |
| `tool-call.sse`     | **Recorded.** Reply with a tool call (`weather_fetch`): `tool_use` input streamed as `input_json_delta`, `tool_result` from the server, then the text. The location is replaced with `REDACTED` and `0.0000` |
| `aborted.sse`       | **Recorded.** Reply with thinking, stopped by the user: the thinking block only streams a summary (`thinking_summary_delta`), then the text ends mid-block, without `message_stop`                           |
| `normal-reply.html` | **Synthetic** DOM snapshot: two finished `[data-testid="assistant-message"]` replies, each ending with the wrapper of `[data-testid="message-actions"]`; last reply id from `normal-reply.sse`               |

To record:

- `normal-reply`: extended thinking off, send a short message and wait for the whole reply;
- `tool-call`: ask for the weather in a city, so that Claude calls a tool, and wait for the whole
  reply;
- `aborted`: turn on extended thinking, ask a long question and press Stop mid-reply.

The streams stopped by the user ended with an `AbortError`, which the recording does not keep:
tests replay them as aborted (`finish("aborted")`) to get a partial reply, and as `done` or
`failed` to check that a stream cut without abort is skipped.

Fixtures not marked **Recorded** were written from the known stream format or, for DOM
snapshots, from the comments in each `page.ts`, not recorded. Replace them with anonymised
recordings as soon as possible: they are what keeps the adapter honest.
