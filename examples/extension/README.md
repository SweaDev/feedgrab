# Feed Detector — example extension (WXT)

A minimal MV3 extension for Chromium and Firefox built on [`feed-detector`](../../README.md):

- **Popup**: "Detect feeds on this page" starts detection and the overlay in the active tab; lists
  the saved profiles for the current host (with Delete) and links to the settings.
- **Content script**: applies the matching saved profile with `openFeed` and hides excluded items
  with `removeItem` (restored when an item goes back to `kept`). On "Detect", it runs
  `detectFeeds` + `openOverlay` and saves the confirmed profile.
- **Background**: the LLM proxy. The content script never holds API keys; it sends
  `fd:llm` messages that the background answers with `handleLlmRequest`.
- **Options**: LLM provider/model/base URL/API key, an enable-LLM switch, and the overlay theme.

## Build

```sh
# from the repository root
bun install
bun run build                                                  # builds the library (dist/)
bun run --filter feed-detector-example-extension build         # .output/chrome-mv3
bun run --filter feed-detector-example-extension build:firefox # .output/firefox-mv3
```

## Load it

- **Chrome/Chromium**: open `chrome://extensions`, enable *Developer mode*, *Load unpacked*, and pick
  `examples/extension/.output/chrome-mv3`.
- **Firefox**: open `about:debugging#/runtime/this-firefox`, *Load Temporary Add-on…*, and pick
  `examples/extension/.output/firefox-mv3/manifest.json`.

## LLM configuration

Settings from the options page take precedence. For dev builds, the background falls back to
`FD_*` variables inlined at build time from a `.env` file in `examples/extension/`:

```sh
FD_LLM_PROVIDER=ollama     # ollama | openai | openrouter | gemini
FD_LLM_MODEL=llama3.2
FD_LLM_BASE_URL=           # optional (Ollama default: http://localhost:11434/v1)
FD_LLM_API_KEY=            # dev builds only: inlined keys end up in the bundle
```

**Ollama** rejects requests from extension origins unless they are allowed:

```sh
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

`FD_E2E=1` enables a dev-only hook (`window.postMessage({ source: 'fd-e2e', type: 'start-detect' })`)
used by the repository's Playwright smoke test.
