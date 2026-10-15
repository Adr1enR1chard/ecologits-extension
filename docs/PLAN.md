# EcoLogits Extension — Implementation Plan

Cross-browser extension that estimates the environmental impact (energy, GHG emissions, water, abiotic resources, primary energy) of generative AI usage on ChatGPT, Claude and Gemini, powered by [`@ecologits/ecologits.js`](https://www.npmjs.com/package/@ecologits/ecologits.js).

## 1. Decisions summary

| Topic              | Decision                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | [WXT](https://wxt.dev) + TypeScript (strict) + Vite, package manager **pnpm**                                                                                                                                          |
| UI                 | **Preact** + **Tailwind CSS** (popup, options page, in-page badge)                                                                                                                                                     |
| Usage capture      | **Network interception** (patched `fetch` / SSE streams) in a main-world script, one adapter per provider. No DOM scraping in the MVP.                                                                                 |
| Impact computation | `llmImpacts()` from `@ecologits/ecologits.js@3.0.0`, run in the background service worker                                                                                                                              |
| Token counting     | `gpt-tokenizer` (`o200k_base`) for all providers; approximation documented for Claude/Gemini                                                                                                                           |
| Reasoning tokens   | Count visible output + streamed reasoning when available; flag hidden reasoning as **"lower-bound estimate"**                                                                                                          |
| Model names        | Per-provider mapping table (web slug → EcoLogits model ID), fallback model per provider, flag **"approximated model"**                                                                                                 |
| Electricity mix    | EcoLogits provider default (USA); no user setting in MVP                                                                                                                                                               |
| Storage            | `storage.local` only: daily aggregates per provider/model + rolling log of the last 500 events (metadata only, never message content)                                                                                  |
| Privacy            | 100% local, no telemetry, no network calls; CSV/JSON export                                                                                                                                                            |
| Display            | Badge: median energy (Wh) + CO₂eq (g), min–max range on hover, toggleable. Popup: totals (today / 7d / 30d / all-time) by provider & model, energy + CO₂eq first, water / ADPe / PE + usage vs embodied in detail view |
| Equivalences       | ADEME (Impact CO2) factors, stored in a sourced constants file                                                                                                                                                         |
| i18n               | English + French from MVP (WXT i18n)                                                                                                                                                                                   |
| Quality            | ESLint 9 (flat) + Prettier (4 spaces, double quotes, width 100), Vitest, fixture-based adapter tests (recorded SSE payloads), GitHub Actions CI. Playwright e2e post-MVP.                                              |
| Resilience         | Adapter parse failures are caught, never surface in the page, and are reported as adapter status in the popup                                                                                                          |
| License            | MPL-2.0 (aligned with EcoLogits)                                                                                                                                                                                       |
| Rollout order      | ChatGPT on Chrome + Firefox → Claude → Gemini → Edge → Safari → store release                                                                                                                                          |

## 2. Architecture

```
┌──────────────────────── Provider tab (chatgpt.com, claude.ai, gemini.google.com) ────────────────────────┐
│                                                                                                          │
│  [main world]  interceptor.ts                         [isolated world]  content.ts                       │
│  - patches window.fetch (and EventSource if needed)   - receives CapturedResponse via window.postMessage │
│  - tees matching response streams                     - validates origin / message shape                 │
│  - provider adapter parses stream →                   - forwards to background (runtime.sendMessage)     │
│    { provider, rawModel, outputText, reasoningText,   - receives ImpactResult → renders badge            │
│      hiddenReasoning, latencyMs, messageId }            (Preact + Tailwind inside Shadow DOM)            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                         │ runtime message
                                         ▼
┌──────────────────────────── Background service worker ───────────────────────────┐
│ 1. Resolve model: mapping table → EcoLogits ID (or provider fallback + flag)     │
│ 2. Count tokens: gpt-tokenizer o200k (outputText + reasoningText)                │
│ 3. llmImpacts({ provider, modelName, outputTokenCount, requestLatency })         │
│ 4. Persist: update daily aggregate + push to rolling event log (max 500)         │
│ 5. Update adapter health status                                                  │
│ 6. Reply ImpactResult { median, min, max per criterion, flags }                  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                         │ storage.local
                                         ▼
                 Popup (Preact + Tailwind) · Options page (Preact + Tailwind)
```

Key rules:

- **No message content ever leaves the main-world script except to the background for token counting**, and it is discarded right after counting. Only metadata is stored.
- The main-world interceptor must be **transparent**: the original response is returned untouched (`response.clone()` / `body.tee()`), and every adapter call is wrapped in `try/catch`.
- `postMessage` between worlds uses a namespaced message type and a per-page random token to avoid spoofing by the host page.

## 3. Proposed repository layout

```
ecologits-extension/
├── entrypoints/
│   ├── background.ts              # service worker: compute, store, health
│   ├── interceptor.content.ts     # main-world script (world: "MAIN"), run_at document_start
│   ├── bridge.content.ts          # isolated content script: relay + badge mount
│   ├── popup/                     # Preact app
│   └── options/                   # Preact app
├── src/
│   ├── providers/                 # one folder per provider, see docs/adding-a-provider.md
│   │   ├── types.ts               # ProviderMeta, ProviderModels, ProviderPage
│   │   ├── registry.ts            # dependency-free metadata: ids, hosts, names, status
│   │   ├── capture.ts             # endpoints registry → main-world interceptor only
│   │   ├── models.ts              # model mapping registry → background
│   │   ├── page.ts                # reply markup registry → bridge
│   │   ├── chatgpt/               # meta, capture (+ parsers), slugs, models, page
│   │   ├── claude/                # meta, capture, models, page
│   │   └── gemini/                # meta only (planned)
│   ├── capture/
│   │   ├── types.ts               # CapturedRequest, StreamParser, ReplyEndpoint
│   │   ├── decoders/              # SSE, NDJSON, JSON helpers
│   │   ├── adapter-contract.ts    # test suite shared by every adapter
│   │   ├── interceptor.ts         # fetch patch, endpoint matching by host
│   │   └── channel.ts · bridge.ts # interceptor ↔ bridge
│   ├── models/
│   │   └── mapping.ts             # web slug → EcoLogits model ID resolution
│   ├── impacts/
│   │   ├── compute.ts             # tokenizer + llmImpacts wrapper, range → median/min/max
│   │   └── equivalences.ts        # ADEME factors + sources
│   ├── storage/
│   │   ├── aggregates.ts          # daily aggregates
│   │   ├── events.ts              # rolling log (500)
│   │   └── export.ts              # CSV / JSON
│   ├── messaging.ts               # typed messages between worlds / background
│   ├── badge/                     # in-page badge: component, reply anchoring, mounting
│   ├── stats/                     # popup summaries per period, provider and model
│   ├── ui/                        # shared Preact components (ImpactValue, RangeTooltip, flags…)
│   └── styles/tailwind.css
├── public/_locales/{en,fr}/messages.json
├── test/fixtures/{chatgpt,claude,gemini}/*.sse   # recorded, anonymised streams
├── wxt.config.ts
├── PLAN.md · README.md · PRIVACY.md · LICENSE
```

## 4. Phases

Each phase ends with its acceptance criteria green in CI.

### Phase 0 — Project bootstrap

- [x] Scaffold WXT project (Preact template) with pnpm, TypeScript strict (target ES2022).
- [x] Add Tailwind CSS (v4, `@tailwindcss/vite`); shared `tailwind.css` entry.
- [x] ESLint 9 flat config (typescript-eslint, eslint-config-prettier) + Prettier (`printWidth: 100`, `tabWidth: 4`, double quotes, trailing commas) — same as `ecologits.js`.
- [x] Vitest setup (+ coverage-v8).
- [x] Add dependencies: `@ecologits/ecologits.js@3.0.0`, `gpt-tokenizer`.
- [x] WXT i18n with `en` and `fr` locales.
- [x] GitHub Actions CI: `lint`, `typecheck`, `test`, `build` for `chrome` and `firefox` (zip artifacts).
- [x] Add `LICENSE` (MPL-2.0), update README.

**Acceptance:** `pnpm dev` loads an empty popup in Chrome and Firefox; CI is green.

### Phase 1 — Core pipeline (provider-agnostic)

- [x] `messaging.ts`: typed message contracts (`CapturedResponse`, `ImpactResult`, `AdapterStatus`).
- [x] `impacts/compute.ts`:
    - token counting with `gpt-tokenizer` (`o200k_base`), loaded once in the service worker;
    - call `llmImpacts({ provider, modelName, outputTokenCount, requestLatency })` (latency in seconds);
    - normalise each criterion to `{ median, min, max }` (handle both scalar and `RangeValue`);
    - propagate `ImpactsOutput.errors` / `warnings` and our own flags (`lowerBound`, `approximatedModel`).
- [x] `models/mapping.ts`: interface + fallback model per provider (e.g. `gpt-5`, `claude-sonnet-4-5`, `gemini-2.5-flash` — to be confirmed per phase); unit tests asserting every mapped target resolves via `models.findModel()`.
- [x] `storage/`: daily aggregates keyed by `YYYY-MM-DD/provider/model` (sum of min/median/max per criterion + request & token counts), rolling event log capped at 500, schema version for future migrations.
- [x] `storage/export.ts`: CSV + JSON export.
- [x] `impacts/equivalences.ts`: ADEME (Impact CO2) factors only (car km, video streaming, email, web search) with source URL and retrieval date per constant.
- [x] Unit tests for all of the above.

**Acceptance:** given a synthetic `CapturedResponse`, the background produces a correct `ImpactResult` and updates storage; tests cover range handling, unknown model fallback, and the 500-event cap.

### Phase 2 — ChatGPT adapter + capture plumbing (Chrome) — **MVP**

- [x] `interceptor.content.ts` (main world, `document_start`): patch `window.fetch`, route matching URLs to the right adapter, tee the stream, measure latency (request start → stream end), post result to the bridge.
- [x] `bridge.content.ts`: validate and relay messages; handle background reply.
- [x] `providers/chatgpt/conversation.ts`: identify the conversation endpoint, parse SSE deltas, extract model slug, final text, reasoning (if streamed), message id; detect hidden reasoning → `lowerBound` flag.
- [x] Record and anonymise real SSE fixtures, replacing the synthetic ones written from the known stream format (procedure in `test/fixtures/README.md`). Logged in, `POST /backend-api/f/conversation`:
    - [x] normal reply (instant model) — `normal-reply.sse`, recorded: new messages arrive as bare `{ v: { message }, c }` and patches as `{ o: "patch", v }` without `p`; the parser handled both unchanged;
    - [x] thinking model with streamed reasoning summaries — `thinking-reply.sse`, recorded and masked: the answer is streamed both as hidden fragments (`is_message_fragment`, `merged_message_id`) and as the visible merged message (`is_merged_message`) concatenating them; the parser counts the merged message only;
    - [x] regenerated reply — `regenerate.sse`, recorded and masked: same format, `message_type: "variant"`, no user message echo;
    - [x] reply with a tool call (web search) — covered by the recorded `thinking-reply.sse` (`web.run` call, tool results); `tool-call.sse` stays as a synthetic complement;
    - [x] reply stopped by the user — `aborted.sse`, recorded and masked: the stream ends mid-patch, without `message_stream_complete` nor `[DONE]`;
    - [x] server error mid-stream: no fixture. By design, a reply that ends in a server error is ignored like any unfinished stream (and error events are skipped explicitly, covered by inline tests); it cannot be triggered reliably to record it;
    - [x] client abort after `message_stream_complete` (the case met live, no `[DONE]`): observed live, and replayed by the interceptor tests by cutting the recorded `normal-reply.sse` before `[DONE]` and failing it with an `AbortError`;
    - [x] drop `snapshots.sse`: no recording shows the legacy full-snapshot encoding anymore. The parser still accepts it as a fallback, covered by inline tests.
- [x] Logged-out mode: the web app uses `/unauth-mweb/…` (`conversation/prepare`, then `conversation/updates?operationId=…`), streaming newline-delimited JSON (`content` lines with `replace`/`append` markdown, `control` lifecycle ending with `terminal-received`). Dedicated adapter `adapters/chatgpt-logged-out.ts`, tested against a recorded fixture. The model is not exposed: the `gpt-5` fallback applies with `approximatedModel`.
    - [x] Reply stopped by the user: recorded, the stream just ends with no `terminal-received`. Recorded as partial since phase 4 (#11).
- [x] Validate end to end on chatgpt.com, logged in, in Chrome: one stored event per reply. Done on 2026-10-14 with the development build: normal reply (`gpt-6`), regenerated reply, regenerated reply with extended thinking (`gpt-6-t-mini`, `lowerBound`) each stored one event with a distinct `messageId` (75–86 output tokens, 0.15–0.18 Wh, 0.07–0.08 gCO₂eq); the reply stopped by the user stored none; no adapter failure. ChatGPT keeps the stream open for several seconds after `message_stream_complete`, so the measured latency can exceed the visible generation time (10.1 s for a regenerated reply).
- [x] Fixture-based adapter tests.
- [x] ChatGPT model mapping (including `auto` and thinking variants).
- [x] Adapter health: track last success / last failure per provider; parse errors never thrown into the page.

Implementation notes:

- The interceptor and the bridge talk over a private `MessageChannel` set up at `document_start` (see `src/capture/channel.ts`) rather than `window.postMessage` with a token: captures never transit on `window`, so page scripts cannot read them or inject fake ones through window messages. This is best effort, not a security boundary: the interceptor shares its realm with the page, which could patch built-ins the parser relies on and distort captures; the bridge validates every message and the worst outcome is wrong local stats for that user.
- ChatGPT aborts its own request right after `message_stream_complete`, so the stream copy usually ends with an `AbortError` instead of `[DONE]`. Interrupted streams are therefore still handed to the parser, which only records a reply if it saw a completion marker; streams errored or unfinished produce no event and are not adapter failures. Only parser exceptions are reported as failures. Since phase 4, streams the page aborts before the completion marker (the user stopped the reply) are recorded as partial (#11).
- Development builds log each capture step to the page console (`[ecologits] …`, `console.debug`): matched or ignored requests, interruptions, skip reasons, relay to the background.
- ChatGPT model slugs are canonicalised (`gpt-5-1-thinking` → `gpt-5.1`, `gpt-5-2-instant` → `gpt-5.2-chat-latest`); `auto`, `o3` and other unknown slugs use the `gpt-5` fallback with the `approximatedModel` flag.

**Acceptance:** on chatgpt.com, each assistant reply produces one stored event with plausible values in Chrome; aborted/failed streams don't crash the page or produce events; fixture tests green.

### Phase 3 — UI (MVP)

- [x] Shared Preact components (`src/ui/`): `ImpactValue` (unit scaling Wh/kWh, gCO₂eq/kgCO₂eq, mL/L, kJ/MJ, ngSbeq/µgSbeq…, in the locale of the messages), `RangeTooltip`, flag icons with explanations (`≥` lower bound, `≈` approximated model).
- [x] **Badge** (`src/badge/`): mounted right after each assistant reply via WXT `createShadowRootUi` (`cssInjectionMode: "ui"`, dedicated `badge.css` with pixel spacing and font sizes, so the host `rem` does not matter). Shows median energy + CO₂eq, ranges, model and output tokens on hover, flags. The badge goes between the reply text and its action bar; the reply is found by its message id (`src/badge/anchor.ts`): logged in, after the reply block `[data-chatgpt-selection-message-id]`; logged out, before the action bar `[data-assistant-message-actions]` of `li[data-message-role="assistant"]`, whose `id` is the message id; the former `data-message-author-role` + `data-message-id` markup is still matched. The id is awaited up to 3 s after the stream ends, then the last reply on the page is used (without id, once the page stops adding nodes); there is no fallback once the user has moved to another conversation. A mutation observer (`src/badge/placement.ts`) inserts the badge once its anchor is on the page and moves it back whenever the page re-renders it: WXT `autoMount` only re-mounts once the selector stops matching, which never happens when the page swaps the reply for a new element with the same id.
- [x] **Popup**: period selector (today / 7d / 30d / all-time), energy and CO₂eq totals, lower-bound / approximated-model counts, equivalences, breakdown by provider and by model, detail view (water, ADPe, PE, usage vs embodied), adapter status, link to options. Updates live from storage.
- [x] **Options page**: toggle badge (applied live to open tabs), export CSV (daily totals, last replies) / JSON, clear data (settings are kept; done by the background so it is ordered with the replies it records), methodology (EcoLogits version, tokenizer approximation, lower-bound and approximated-model explanations, electricity mix).
- [x] All strings in `en` + `fr` locales; message keys are typed from `en/messages.json` and a test checks keys and placeholders match across locales.
- [x] Validate end to end on chatgpt.com, logged in, in Chrome: badge under each reply (light and dark themes, regenerated reply, navigation between conversations), popup totals, badge toggle, exports. Done manually on 2026-10-14.

Implementation notes:

- Checked in headless Chromium with the production build on a fake chatgpt.com page served by Playwright and replaying the recorded fixtures: the badge is mounted under the reply (by id for `normal-reply.sse`, by the last-reply fallback for `thinking-reply.sse`), follows the page's text colour in light and dark themes, the popup and options page render in French, and disabling the badge removes it from the open page. The first live test showed no badge: chatgpt.com no longer renders `data-message-author-role` / `data-message-id`; the anchor now follows the markup observed on 2026-10-14, logged in and logged out (two different apps).
- Badges are shown for replies captured since the page was loaded; replies already in the conversation when it is opened get none.
- Extension pages take `ECOLOGITS_VERSION` from `src/impacts/version.ts` (kept in sync with the library by a test): importing it from `@ecologits/ecologits.js` bundled the whole model database (~125 kB) with the popup and options page.
- Settings live in `storage.local` (`settings`), separate from usage data.
- Numbers and dates use the browser locale only when the messages are in its language (`messagesLocale` message), otherwise the language of the messages shown: a German browser gets English text with English number formats.

**Acceptance:** MVP usable end-to-end on ChatGPT in Chrome; badge can be disabled; export produces valid files; UI fully translated.

### Phase 4 — ChatGPT on Firefox + capture follow-ups — **MVP**

Left over from phase 2, done once the phase 3 UI (badge, popup adapter status) makes captures visible without the service worker console.

- [ ] Firefox specifics: verify main-world injection and `fetch` patching work under MV3 on Firefox.
- [ ] Validate end to end on chatgpt.com, logged in, in Firefox: one stored event per reply.
- [ ] Exports in Firefox: `src/ui/download.ts` clicks a detached `<a>` and revokes the object URL right after; attach the link to the document and revoke later if Firefox drops or empties the download.
- [x] Replies stopped by the user (#11): recorded with the output streamed until the stop, flagged `partial` (badge `…`, popup count, `partial` / `partial_requests` export columns). Storage schema v2 adds the flag to stored events and aggregates.
- [ ] Validate replies stopped by the user end to end on chatgpt.com (logged in and out) and claude.ai: one stored event flagged `partial`, badge under the stopped reply.
- [ ] Logged-out mode: record a reply with a tool call or reasoning, if the logged-out app offers them (errors are ignored by design, as logged in).

Implementation notes:

- Stopped replies: the interceptor tells the parser how the stream ended (`StreamEnd`): read to its end (`done`), aborted by the page (`aborted`, a `DOMException` named `AbortError`), or cut by the network (`failed`). A reply without completion marker is recorded as `partial` only when `aborted`, and only without error event. Leaving the page mid-reply aborts the request too: it is counted the same way, since the tokens were generated. ChatGPT also aborts its request right after `message_stream_complete`: the marker was seen, so the reply is complete, not partial. Logged out, a partial reply needs the `assistant-content-started` marker.
- Latency runs from the request to the stop, consistent with the output counted.
- Deduplication by `messageId` keeps the first event: a stopped reply that ChatGPT continues under the same id is not counted twice, but the continuation is not counted either. A regenerated reply has its own id and is counted on its own.

**Acceptance:** phase 2 and phase 3 acceptance criteria also met in Firefox.

### Phase 5 — Claude adapter

- [x] `providers/claude/capture.ts`: completion endpoint SSE parsing, model extraction, streamed thinking summaries counted, hidden reasoning flag.
- [x] Fixtures + tests; Claude model mapping (web labels → IDs such as `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-sonnet-4-6`…).
- [x] Anonymised recordings (procedure in `test/fixtures/README.md`): normal reply, tool call, reply with thinking stopped by the user. The model is in `message_start.message.model` (`claude-sonnet-5-5` for the default model); the recordings were made without a `model` in the request body.
- [x] Record a completed reply with thinking, a regenerated reply (`retry_completion`) and a web search: checked on 2026-10-15, same format as the recorded fixtures.
- [x] Badge anchoring on claude.ai.
- [x] `claude` supported in the provider registry and the content script match patterns.
- [x] Validate end to end on claude.ai in Chrome and Firefox: one stored event per reply, badge under each reply. Done on 2026-10-15.

Implementation notes:

- Endpoint: `POST /api/organizations/{org}/chat_conversations/{conversation}/completion` (`retry_completion` when regenerating). With `rendering_mode: "messages"` the stream mirrors the Anthropic Messages API events; the reply counts once `message_stop` arrives. Former `{ type: "completion" }` events are still accepted.
- Output: text blocks and the input of the model's tool calls (`tool_use`, e.g. web search queries, artifacts); `tool_result` blocks come from the server and are not counted. Reasoning: claude.ai does not stream the thinking, only summaries of it (`thinking_summary_delta`): they are counted as reasoning and the reply is flagged `hiddenReasoning`, as are `redacted_thinking` blocks. `thinking_delta` text, as streamed by the API, would be counted instead of the summaries.
- Model: `message_start.message.model`, else the `model` of the request body, else the `claude-sonnet-5-5` fallback (`approximatedModel`), the default model of claude.ai. Names are canonicalised (`src/providers/claude/models.ts`): date and `-latest` suffixes dropped, display labels (`Claude Opus 4.5`) rewritten as IDs. Dated IDs EcoLogits knows (`claude-sonnet-4-5-20250929`) are kept as-is. Replayed through the interceptor and `computeImpact`, the recordings resolve to `claude-sonnet-5-5` without approximation (9 tokens and 0.05 Wh for the short reply).
- Badge: the reply is `[data-testid="assistant-message"]`, whose `data-turn-key` is expected to be the message `uuid` of the stream; it holds a screen-reader heading, the content, then a wrapper of the action bar (`[data-testid="message-actions"]`, rendered once the reply is complete). The badge goes before that wrapper (markup observed on 2026-10-15). If the id is not rendered within 3 s, the last finished reply (`data-is-streaming="false"`) is used, once the latest one is no longer streaming (awaited up to 30 s, then the badge is dropped). Any path other than `/chat/<id>` (`/new`, a project page…) starts a new conversation, whose first move to `/chat/<id>` is not a move to another conversation; a second move is (same rule for ChatGPT from `/`).

**Acceptance:** same as Phases 2 and 4 (Chrome and Firefox) for claude.ai.

### Phase 6 — Gemini adapter

- [ ] Follow `docs/adding-a-provider.md` from `src/providers/gemini/meta.ts`.
- [ ] `providers/gemini/capture.ts`: Gemini web uses a non-standard batched RPC stream — parse it robustly, extract model when exposed, otherwise fallback + `approximatedModel` flag.
- [ ] Fixtures + tests; Gemini model mapping (fallback candidate: `gemini-2.5-flash`; e.g. `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.1-pro-preview`…).
- [ ] Badge anchoring on gemini.google.com.

**Acceptance:** same as Phases 2 and 4 (Chrome and Firefox) for gemini.google.com.

### Phase 7 — Edge

- [ ] Add `edge` build target to CI; manual smoke test on the three providers.

**Acceptance:** Edge build works on all three providers.

### Phase 8 — Safari

- [ ] Build Safari target with WXT, convert with `xcrun safari-web-extension-converter`, Xcode project in repo (or generated in CI).
- [ ] Verify main-world injection and stream teeing on Safari; document any limitations.
- [ ] Requires an Apple Developer account for distribution.

**Acceptance:** extension runs in Safari (macOS) on the three providers.

### Phase 9 — Release

- [ ] `PRIVACY.md` / hosted privacy policy (local-only, no content stored, no telemetry).
- [ ] Store assets (icons, screenshots, descriptions in EN/FR).
- [ ] Publish to Chrome Web Store, Firefox Add-ons (AMO), Edge Add-ons, then Safari (App Store).
- [ ] Release workflow: tag → build zips for each browser → GitHub Release (optionally `wxt submit`).
- [ ] Justify permissions in store listings (host permissions for the three provider domains only, `storage`).

**Acceptance:** extension publicly available on Chrome, Firefox and Edge stores.

### Post-MVP backlog

- Playwright e2e tests against recorded fixtures.
- DOM-scraping fallback when network interception fails.
- User-selectable electricity mix zone.
- IndexedDB full history if 500-event log proves insufficient.
- Additional providers (Mistral Le Chat, Copilot…).

## 5. Risks and mitigations

| Risk                                                  | Mitigation                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Providers change internal APIs/stream formats         | Isolated adapters, fixture tests, health status in popup, silent failure in page                      |
| Hidden reasoning tokens → underestimation             | `lowerBound` flag + methodology note                                                                  |
| Replies stopped by the user                           | Recorded up to the stop, `partial` flag                                                               |
| Web model labels don't match EcoLogits IDs            | Mapping table with tests against `models.findModel()`, fallback + `approximatedModel` flag            |
| Tokenizer mismatch for Claude/Gemini                  | Documented approximation                                                                              |
| Bundle size (EcoLogits data + tokenizer)              | Loaded only in the background service worker, never in content scripts                                |
| Host page CSS conflicts with badge                    | Shadow DOM + Tailwind CSS injected into shadow root                                                   |
| Main-world patching detected or broken by page CSP    | Inject via WXT `world: "MAIN"` content script (not inline script), keep patch minimal and transparent |
| Store review on host permissions / main-world scripts | Minimal permissions, clear privacy policy and justification                                           |
