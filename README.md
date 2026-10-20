# EcoLogits Extension

Browser extension that estimates the environmental impact of your generative AI usage, reply by reply, powered by [EcoLogits](https://ecologits.ai).

**Website:** <https://adr1enr1chard.github.io/ecologits-extension/> ([en français](https://adr1enr1chard.github.io/ecologits-extension/fr/))

> **Pre-release:** not on the browser stores yet ([#9](https://github.com/Adr1enR1chard/ecologits-extension/issues/9)). Install it from source (see below).

## Features

- **Badge under each reply** with its estimated energy, GHG emissions and water, and the min–max range on hover. It can be turned off in the settings.
- **Popup** with totals for today, 7 days, 30 days and all time, broken down by provider and model: energy, GHG emissions (with everyday equivalents from ADEME Impact CO2), water, abiotic resources and primary energy, split into usage and embodied impacts. It also shows whether capture works on each provider.
- **Flags** when an estimate is less certain: a lower bound (the model's reasoning is hidden), an approximated model (the web app does not expose a model EcoLogits knows), or a reply stopped before its end.
- **Your data stays local:** only metadata and impacts are stored in the browser, never message content, and nothing is sent anywhere. Export to CSV or JSON, or delete everything, from the settings.
- English and French.

## Supported providers and browsers

|                    | Chrome | Firefox | Edge ([#7](https://github.com/Adr1enR1chard/ecologits-extension/issues/7)) | Safari ([#8](https://github.com/Adr1enR1chard/ecologits-extension/issues/8)) |
| ------------------ | :----: | :-----: | :------------------------------------------------------------------------: | :--------------------------------------------------------------------------: |
| ChatGPT (OpenAI)   |   ✅   |   ✅    |                                  planned                                   |                                   planned                                    |
| Claude (Anthropic) |   ✅   |   ✅    |                                  planned                                   |                                   planned                                    |
| Gemini (Google)    |   ✅   |   ✅    |                                  planned                                   |                                   planned                                    |

To add a provider, see [Adding a provider](docs/adding-a-provider.md).

## How it works

1. A script in the provider's page wraps `fetch` and reads a copy of the reply stream, leaving the page's own response untouched.
2. A per-provider adapter extracts the model, the generated text (and the reasoning, when it is streamed) and the generation time.
3. The background service worker counts the output tokens (`o200k_base` tokenizer), maps the web model to an EcoLogits model, and computes the impacts with [`@ecologits/ecologits.js`](https://www.npmjs.com/package/@ecologits/ecologits.js).
4. The result is stored as daily totals plus a log of the last 500 replies, and shown in the badge and the popup.

The options page explains the methodology and its approximations.

## Install from source

```sh
pnpm install
pnpm build            # Chrome: load .output/chrome-mv3 as an unpacked extension
pnpm build:firefox    # Firefox: load .output/firefox-mv3/manifest.json as a temporary add-on
```

## Development

Requirements: Node.js ≥ 20 and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev            # Chrome, with hot reload
pnpm dev:firefox    # Firefox
```

| Command                             | Description                            |
| ----------------------------------- | -------------------------------------- |
| `pnpm build` / `pnpm build:firefox` | Production build in `.output/`         |
| `pnpm zip` / `pnpm zip:firefox`     | Build and package as a store-ready zip |
| `pnpm lint`                         | ESLint                                 |
| `pnpm format` / `pnpm format:check` | Prettier                               |
| `pnpm typecheck`                    | TypeScript (strict)                    |
| `pnpm test` / `pnpm test:coverage`  | Vitest                                 |
| `pnpm test:e2e`                     | Playwright, on the development build   |

Stack: [WXT](https://wxt.dev), TypeScript, Preact, Tailwind CSS v4. Translations live in `public/_locales/{en,fr}/messages.json`.

## License

[MPL-2.0](LICENSE)
