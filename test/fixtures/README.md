# Adapter fixtures

Response streams of each provider's reply endpoint, and DOM snapshots of its conversation page.
`scripts/fixtures/recorded-cases.test.ts` replays every stream of `scripts/fixtures/cases/` with
the parser of the case's `endpoint`: the outcome must be the one the case asks to record (a reply,
a partial one or a skip), with an output and a message id for a reply, and a partial stream cut
without abort must be skipped. It also runs the adapter contract
(`src/capture/adapter-contract.ts`: re-split into chunks of various sizes, truncated, noise) on
the streams of each endpoint. The page tests (`src/providers/*/page.test.ts`) replay the DOM
snapshots. No test asserts a recorded value (text, id, model, length): recording a case again
only breaks a test when the code no longer handles it. Each parser's rules are tested on
synthetic streams, in `src/providers/<id>/*.test.ts`.

## Recording a fixture

Run `pnpm fixtures:record <provider> [case]`. It builds the development extension, opens the
provider in Chromium with it, and goes through the cases of `scripts/fixtures/cases/<provider>.ts`
(only `case` when given). The browser profile is kept in `.recorder/<provider>/` (gitignored):
sign in once, the session stays. The recorder does not drive the chat: for each case, it opens the
case's URL and prints what to do (send a message, press Stop, turn on thinking…), then:

1. captures the next stream through the interceptor's development hook
   (`window.__ecologitsOnStream`), exactly as the extension received it, including client-side
   aborts, which DevTools' Network tab often shows as "(canceled)" with no body;
2. parses it with the provider's parser and checks how it ended (`done` or aborted), what the
   parser made of it (`reply`, `partial` or `skip`) and the case's own `check`; on a mismatch, it
   says why and asks to redo the case, skip it, or write it unchecked (see below);
3. waits until the page shows the streamed reply as its last finished one, nothing rendering, and
   takes the DOM snapshot (see below);
4. anonymises the stream (`anonymiseStream`) and the snapshot (`sanitiseSnapshot`) with the same
   ids, and checks that the anonymised stream still parses to the same kind of outcome and that the
   snapshot's last reply has the stream's id;
5. writes `<provider>/<file>` and `<provider>/<case>.html`, and prints their paths.

When the provider changed its stream or its page, the parser or the page markup no longer
matches what is recorded, and every case fails its checks: write them unchecked, to fix the code
against them. The stream and the page as it is are anonymised and written without any check; the
snapshot is the element holding the replies the markup still finds, or the whole page body,
to trim by hand, when it finds none. The recorder lists the cases written unchecked at the end.

Then check the diff, update the tables below, and list a new snapshot in `PAGE_SNAPSHOTS`. The hook, like `__ecologitsStreams`, only exists in development builds: the CI
`build` job fails if the production zip holds `__ecologitsOnStream`, `__ecologitsStreams` or
`stream recorded`. If Google sign-in refuses the automated browser, launch Chromium by hand with
`--remote-debugging-port` and the development build, and connect to it with
`chromium.connectOverCDP` instead of `launchRecorder` (`scripts/fixtures/browser.ts`); this
fallback is not built.

Without the recorder, run `pnpm dev`, open the provider and its DevTools console (top frame), and
send a message: the interceptor logs `[ecologits] stream recorded …` and keeps the last 5 raw
streams in `__ecologitsStreams`; `copy(__ecologitsStreams.at(-1).text)` copies the last one, and
its `end` tells how it ended (`done` or the abort error). Anonymise it with
`anonymiseStream(provider, text)` from `scripts/fixtures/anonymise.ts`.

Anonymising applies the rules below; the keys it keeps, maps or redacts are listed per provider in
`scripts/fixtures/providers/`. `scripts/fixtures/no-personal-data.test.ts` fails if a fixture
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
for the badge to find the last one: the recorder takes the innermost element holding the replies
and the last one's anchor (its parent when that is the reply itself). Snapshots are listed in
`src/providers/page-snapshots.ts` (`PAGE_SNAPSHOTS`), and `src/providers/page-contract.ts` replays them in happy-dom: for the markup
of `PAGES[<provider>]` each one is rendered with, the `reply` selector finds a last finished reply
with an `idAttribute`, `rendering(root)` is false and `anchor(id).selector` resolves to exactly one
element. Each snapshot also removes what its anchor
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

## Checking for drift

A provider changing its stream format or its markup breaks no test: the fixtures are what it
used to send. Run `pnpm fixtures:drift <provider> [case]` to find out whether it still sends it,
after a provider shipped a visible change, before a release, or when a user reports missing
results or badges. It goes through the cases exactly as `pnpm fixtures:record` does (same
browser, profile, instructions and checks, see above), but writes nothing: it compares each
fresh, anonymised recording with the committed fixtures of its case, by shape, not by text
(`scripts/fixtures/shape.ts`):

- **stream**: the event types (SSE event name and JSON `type`; markers like `[DONE]`), added,
  missing or coming in another order (of first occurrence: the number of deltas or blocks varies
  from a reply to another), and every JSON key path with the types of its values (`string`,
  `number`, `boolean`, `null`, `object`, `array`), added, missing or changed. Keep-alive events
  (`keepAlive` in `scripts/fixtures/providers/`: Claude's `ping`) are left out, since they come
  whenever the timing says, and a value `null` in one stream only is no change;
- **outcome**: what the parser makes of each stream, a reply, a partial one or a skip, and its
  model; a stream it cannot parse, committed or fresh, always drifted;
- **page**: the fresh snapshot must pass the DOM snapshot checks (a last reply matched, with an
  id, not rendering, one anchor); when the case has a committed snapshot, the markup it matches
  and the path from the last reply to its anchor must be the same, each element as its tag and
  the names of its `data-*` and `role` attributes (classes, ids and text attributes change with
  the page's state).

A case without committed stream is not recorded: it is reported, to record with
`pnpm fixtures:record`. A case that fails the recorder's checks can be redone, skipped, or kept:
it then drifted by that failure, and is compared all the same. The command prints one line per
case, `ok`, `skipped` or `drift` followed by what changed, and exits with 1 when any case
drifted. Then record the cases that drifted again with `pnpm fixtures:record` and fix the code
against them.

It needs a signed-in session in `.recorder/<provider>/` and a person doing what each case says,
so it runs locally only, never in CI. `scripts/fixtures/drift-check.test.ts` checks that every
committed case shows no drift from itself.

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
