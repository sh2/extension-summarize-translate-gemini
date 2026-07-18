# AGENTS.md

## Project overview

Cross-browser extension (Chrome, Firefox, Edge) that uses Google Gemini API and OpenAI-compatible APIs to summarize and translate web pages. It also supports YouTube caption summarization, image/PDF summarization, follow-up questions, custom actions, and streaming LLM output.

- **Platform:** Chrome Extension Manifest V3
- **Language:** Vanilla JavaScript (ES modules) — no TypeScript, no bundler, no framework
- **API backend:** Google Gemini API + OpenAI-compatible APIs
- **Version source:** `extension/manifest.json` and `firefox/manifest.json`

## Core rules

- Conversation content is stored in a provider-agnostic format using Gemini-style `parts` arrays with `role` fields (`"system"`, `"user"`, `"model"`).
- `generateContent()` and `streamGenerateContent()` in `extension/utils.js` are the only entry points for LLM calls.
- Keep changes inside `extension/` unless the task is specifically about `firefox/` manifests or the translation helper scripts in `utils/`.
- Do not edit files in `extension/lib/`.
- Always use block braces `{}` for control statements such as `if`, `else`, `for`, and `while` (brace-less single-line statements like `if (cond) return;` are strictly prohibited).

## Task routing

- Popup UI, page extraction, image/PDF input: `extension/popup.html` and `extension/popup.js`
- Results tab, follow-up conversation, streaming display: `extension/results.html` and `extension/results.js`
- Options UI, provider settings, model/language settings: `extension/options.html` and `extension/options.js`
- Background logic, context menus, shortcuts, cached results: `extension/service-worker.js`
- LLM provider logic, shared utilities, error handling, theme helpers: `extension/utils.js`
- Dropdown templates: `extension/templates.html`
- Localized strings: `extension/_locales/*/messages.json`
- Firefox-specific changes: `firefox/manifest.json`

## Source file organization

Each JavaScript source file under `extension/` is divided into named sections with `// ── Section name ──...──` separator comments. Keep the section vocabulary and ordering consistent across files so that dependencies flow from low-level helpers toward entry points.

### Section vocabulary

Reuse the existing section names rather than inventing new ones. The canonical set, in dependency order:

1. `Pure utilities (no DOM access, no side effects)` — functions that depend only on their arguments and return values. No `document.*`, `Image`, `FileReader`, `canvas`, listener registration, or module-state mutation. Plain data constants also belong here.
2. Specialized helpers (e.g. `Content script injection utilities`, `Image processing`, `Tab state & notification`) — grouped by domain when a file has enough related helpers to justify a dedicated section.
3. `UI helpers` — DOM reads/writes, form population, preview rendering, status text. DOM element references (e.g. `const x = document.getElementById(...)`) belong here, not in `Pure utilities`.
4. `Button action handlers` — handlers wired to specific buttons.
5. `Core async logic` — orchestration functions (`main`, `askQuestion`, `waitForResult`, `saveOptions`, etc.). `initialize` is the last function in this section.
6. `Event listeners` — always the last section in the file; contains only listener registration and the initial call to `initialize()`.

`extension/utils.js` uses a library-oriented vocabulary instead: `UI helpers`, `Extension helpers`, `LLM APIs`. Within each section, place internal helpers before the exported entry point they support (bottom-up ordering, plan A).

### Ordering rules

- Place functions so that a function is defined before it is used within the same file, and so that lower-level helpers come before higher-level orchestration.
- Within a section, prefer `internal helper → exported API` ordering. If an exported function is self-contained, it may sit at the top of its section.
- Keep `initialize` as the last function in `Core async logic`, and keep `Event listeners` as the last section.
- Do not place DOM-touching or side-effectful functions in `Pure utilities`. Move them to `UI helpers` or a specialized helper section.
- When adding a function, choose the section by what the function does, not by where it happens to be called from.

## Validation

- After code changes, run `npm run lint` and `npm test`, and fix relevant errors or test failures before finishing.
- When modifying provider logic, verify both `apiProvider: "gemini"` and `apiProvider: "openai"` paths still work.
- When updating the extension version, update both `extension/manifest.json` and `firefox/manifest.json`.
- `npm run test:e2e` runs the minimal Chromium E2E under `e2e/` (Playwright, local mock API). It is not part of `npm test` and is not a PR-required check; run it on `main` and before releases. See [`docs/TESTING_PHASE_5.md`](docs/TESTING_PHASE_5.md).

## Logging policy

`console.*` levels are used to separate "expected during normal use" from "extension internals went wrong". Keep the distinction consistent across `popup.js`, `results.js`, `options.js`, `service-worker.js`, and `utils.js`.

### Level definitions

| Level | Use for | Examples |
| --- | --- | --- |
| `console.error` | Extension-internal failures that should not happen during normal use. Bugs, broken invariants, infrastructure failures (storage, tabs, sendResponse, template loading). | `Failed to update cache`, `Failed to send response`, `Failed to find the template` |
| `console.warn` | Reserved for cases that are abnormal but recoverable and worth surfacing without implying a bug. Avoid using it for ordinary API failures. | (currently none — prefer `log` for API outcomes) |
| `console.log` | Expected or environment-dependent outcomes that users may hit during normal use, including LLM API errors, retry/fallback progress, permission denials, and fallback paths. | `503 retrying: ...`, `Failed to parse the article. Using document.body.innerText instead.`, clipboard permission denied |
| `console.debug` | Noise that is only useful when tracing a specific issue. | `Stale results tab was already closed` |

### Rules

- LLM API failures returned as `{ ok: false, status, body }` from `generateContent()` / `streamGenerateContent()` are **expected outcomes**, not exceptions. Do not log them with `console.error` at the call site; use `console.log` if logging is needed. The retry/fallback progress logs in `extension/utils.js` are the canonical example.
- `catch` blocks that wrap a broad flow (e.g. `main()` in `popup.js`, the generation handler in `service-worker.js`, `askQuestion()` in `results.js`) may still use `console.error`, because they catch unexpected internal failures rather than ordinary API responses. If such a block also surfaces a user-facing message, ensure the message text does not imply the API itself failed when the real cause is internal.
- Do not log raw API keys, request headers, or `Authorization` values. The existing `"Request:"` / `"Response:"` debug logs in `popup.js` and `results.js` are acceptable because they only include request bodies and response payloads.
- Storage / tab / messaging / template infrastructure failures stay at `console.error`.
- User-environment failures (clipboard permission, unsupported image format, Readability fallback, missing YouTube transcript, `chrome://` page extraction) use `console.log` (or `console.debug` when truly noise-only).
- When a failure is already surfaced to the user via UI (toast, status text), prefer `console.log` over `console.error` unless it represents an internal bug.
- Do not introduce `console.info`. Use `console.log` for general informational output.

## Notes

- `firefox/` only contains a manifest override; the extension source lives under `extension/`.
- `extension/manifest.json` defines the unpacked extension structure, permissions, and content scripts.

## Custom error codes (1000+)

Defined in `extension/utils.js`. Used internally when API calls fail before receiving an HTTP status.

| Code | Meaning |
| --- | --- |
| 1000 | Network error (fetch failed) |
| 1001 | No models available |
| 1002 | OpenAI-compatible Base URL is not set |
| 1003 | OpenAI-compatible Base URL is invalid |
| 1004 | Unexpected internal error |

## Updating vendored libraries

The files under `extension/lib/` are third-party libraries. Do not edit them in place. When updating, replace them with the latest minified builds downloaded from jsDelivr.

Current vendored files:

| File | Package | jsDelivr URL template |
| --- | --- | --- |
| `extension/lib/Readability.min.js` | `@mozilla/readability` | `https://cdn.jsdelivr.net/npm/@mozilla/readability@<version>/Readability.min.js` |
| `extension/lib/marked.umd.min.js` | `marked` | `https://cdn.jsdelivr.net/npm/marked@<version>/lib/marked.umd.min.js` |
| `extension/lib/purify.min.js` | `dompurify` | `https://cdn.jsdelivr.net/npm/dompurify@<version>/dist/purify.min.js` |

Steps to update:

1. Check the latest version on npm or GitHub for each package listed above.
2. Download the minified build for the new version from the jsDelivr URL template, preserving the exact file names under `extension/lib/`.
3. Do not modify the downloaded file contents.
4. Run `npm run lint` after replacing the files.
5. Verify the version strings in the file headers (e.g. `/npm/@mozilla/readability@0.6.0/Readability.js`, `marked@18.0.5`, `DOMPurify 3.4.11`).
