# Adding a provider

A provider lives in two folders, found by their name (its `id`): nothing else lists them
([ADR 0001](adr/0001-provider-folders-discovered-not-registered.md)).

`src/providers/<id>/`, one file per execution context, each default-exporting its contract:

| File         | Context                                  | Contents                                                                               |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `meta.ts`    | every context, the main-world script too | `ProviderMeta`: id, name, hosts, status, logo. Type imports only                       |
| `capture.ts` | main-world interceptor only              | `ProviderCapture`: reply endpoints `{ method, path, createParser }`, stream parser     |
| `models.ts`  | background                               | `ProviderModels`: EcoLogits provider, fallback model, aliases, proxies, `canonicalize` |
| `page.ts`    | bridge content script (badge)            | `ProviderPage`: reply markups, `isNewConversation`                                     |

Keep them apart: an object grouping all four would make the interceptor, injected into the page,
bundle EcoLogits and DOM code. Code that two contexts share, such as a slug grammar, goes into
its own dependency-free file (see `chatgpt/slugs.ts`).

`test/fixtures/<id>/`: the recorded streams and DOM snapshots, and `fixtures.ts`, which declares
them (`ProviderFixtures`): a URL of each reply endpoint, the recorded cases with how to record
each, the DOM snapshots, and the keys the anonymiser keeps, maps or redacts.

## Statuses

- `"planned"`: only `meta.ts`, announced in the popup as coming soon.
- `"beta"`: being added. Captured in development builds only, announced as planned to users.
  Each file is used as soon as it exists: without `models.ts` a reply is not estimated, without
  `page.ts` it gets no badge.
- `"supported"`: captured for users. `src/providers/registry.test.ts` checks it is complete.

The `id` is stored with every result and adapter status: never rename it. The order of
`PROVIDERS` (`src/providers/registry.ts`) is the display order.

## Supporting it

1. Write `src/providers/<id>/meta.ts` with `status: "beta"` and add it to `PROVIDERS`.
2. Declare the reply endpoint in `capture.ts` (copy `claude/`): endpoints only declare a method
   (`POST` by default) and a path, hosts are checked by the interceptor; an endpoint on an API
   host that is not among the provider's hosts declares it in `host` (see `gemini/`). The development build
   only records the streams of a declared endpoint.
3. Write `test/fixtures/<id>/fixtures.ts` (copy `claude/fixtures.ts`): an endpoint URL and the
   anonymiser's rules. Record a first stream from the DevTools console and anonymise it with
   `pnpm fixtures:anonymise <id> test/fixtures/<id>/<file>` (procedure in
   `test/fixtures/README.md`), then write the parser, testing its rules on synthetic streams in
   `capture.test.ts`. Stream decoders and JSON helpers are in `src/capture/decoders/`. List each
   recorded stream in `cases` with how to record it, how it ended, the outcome it is recorded
   for and, when the case depends on what was asked (a tool call, thinking), a `check` that the
   stream still is that case. `test/recorded-cases.test.ts` replays it and runs the adapter
   contract. Assert no recorded value: recording again must not break a test.
4. Fill in `models.ts`; test the slugs of the web app in `models.test.ts`. A proxy stands in, as
   one EcoLogits model or a `{ low, high }` range, for a web model EcoLogits does not know yet;
   its estimates are flagged as approximated.
5. Fill in `page.ts` with the markup of finished replies and where the badge goes. Save a DOM
   snapshot of a conversation per markup with `copy(document.body.outerHTML)`, anonymise it with
   the stream of the same case,
   `pnpm fixtures:anonymise <id> test/fixtures/<id>/<file> test/fixtures/<id>/<case>.html`, and
   list it in `snapshots`: `test/page-snapshots.test.ts` replays it.
6. Set `status: "supported"` and run `pnpm test`: `registry.test.ts` checks that the provider has
   an endpoint, models, a markup with a snapshot, a recorded case, and a fallback model EcoLogits
   knows, that aliases and proxies point to models EcoLogits knows, that no proxy shadows a
   model EcoLogits knows, that hosts are unique and that every locale's `extDescription` names
   the provider.
7. Update the rest by hand:
    - `public/_locales/{en,fr}/messages.json`: `extDescription`, and `methodologyTokenizer` when
      the provider's tokenizer is not public;
    - `README.md` (supported providers);
    - tick the provider's phase issue on GitHub;
    - optionally, sample data in `entrypoints/gallery/samples.ts`.
8. Check end to end in Chrome and Firefox with `pnpm dev`: one stored event per reply, a badge
   under each reply.
