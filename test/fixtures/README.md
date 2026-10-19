# Adapter fixtures

Response streams of each provider's reply endpoint, and DOM snapshots of its conversation page,
declared in `<provider>/fixtures.ts` (`ProviderFixtures`, `provider-fixtures.ts`): each recorded
case with its endpoint and how to record it, each snapshot, and the anonymiser's rules. They are
tested in `test/`, the tool that anonymises them is in `scripts/fixtures/`:

- `test/recorded-cases.test.ts` replays every recorded stream (`cases`) with the parser of its
  endpoint: the outcome must be the one the case is
  recorded for (a reply, a partial one or a skip), with an output and a message id for a reply,
  a partial stream cut without abort must be skipped, and a case's `check` tells the stream
  still is that case (a web search, a tool call…). It also runs the adapter contract
  (`src/capture/adapter-contract.ts`: re-split into chunks of various sizes, truncated, noise) on
  the streams of each endpoint.
- `test/committed-fixtures.test.ts` checks that no fixture holds personal data and that every
  DOM snapshot is already sanitised.
- `test/page-snapshots.test.ts` replays the DOM snapshots (`snapshots`).

No test asserts a recorded value (text, id, model, length): recording a case again only breaks a
test when the code no longer handles it. Each parser's rules are tested on synthetic streams, in
`src/providers/<id>/*.test.ts`.

## Recording a fixture

Fixtures are recorded by hand. Run `pnpm dev`, open the provider and its DevTools console (top
frame), and do what the case's `howToRecord` says (send a message, press Stop, turn on
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
reply as `src/providers/<provider>/page.ts` finds it: the snapshot is then the whole body, to
trim by hand.

Then check the diff, run `pnpm test`, and list a new stream in `cases` and a new snapshot in
`snapshots`, with a comment on what it holds. `__ecologitsStreams` only exists in development builds: the CI `build` job fails
if the production zip holds `__ecologitsStreams` or `stream recorded`.

Anonymising applies the rules below; the keys it keeps, maps or redacts are listed per provider in
`<provider>/fixtures.ts` (`rules`). `test/committed-fixtures.test.ts` fails if a fixture
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

Gemini streams a WebChannel back channel, `<length>\n[[id,[payload]]]` batches of base64 protobuf
messages, without field names. Each message is decoded, its fields classified by their path of
field numbers (`2.7.1.4.4.2.1` for the conversation id) as JSON values by their key, numbers
kept, then encoded back, and each batch's length prefix recomputed. A length-delimited field is
read as a sub-message when its bytes are one, else as a string. `test/committed-fixtures.test.ts`
searches these messages by the strings they hold.

## DOM snapshots

`<provider>/<case>.html` is the outerHTML of the element holding a conversation's replies, enough
for the badge to find the last one: `pnpm fixtures:anonymise` keeps the innermost element holding
the replies and the last one's anchor (its parent when that is the reply itself). Snapshots are
listed in `<provider>/fixtures.ts` (`snapshots`), and `src/providers/page-contract.ts` replays
them in happy-dom: for the markup of `src/providers/<provider>/page.ts` each one is rendered with, the `reply` selector finds a last finished reply with an
`idAttribute`, `rendering(root)` is false and `anchor(id).selector` resolves to exactly one
element. Each snapshot also removes what its anchor depends on (the action bar, or the reply id
when the badge follows the reply block) and checks that the anchor is lost. `src/providers/registry.test.ts` checks that every markup of every
supported provider has a snapshot.

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

The streams stopped by the user ended with an `AbortError`, which the recording does not keep:
tests replay them as aborted (`finish("aborted")`) to get a partial reply, and as `done` or
`failed` to check that a stream cut without abort is skipped.

Fixtures without `howToRecord`, or whose comment says they were written by hand, were written
from the known stream format or, for DOM snapshots, from the comments in each `page.ts`, not
recorded. Replace them with anonymised
recordings as soon as possible: they are what keeps the adapter honest.
