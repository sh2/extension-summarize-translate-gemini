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

## Task routing

- Popup UI, page extraction, image/PDF input: `extension/popup.html` and `extension/popup.js`
- Results tab, follow-up conversation, streaming display: `extension/results.html` and `extension/results.js`
- Options UI, provider settings, model/language settings: `extension/options.html` and `extension/options.js`
- Background logic, context menus, shortcuts, cached results: `extension/service-worker.js`
- LLM provider logic, shared utilities, error handling, theme helpers: `extension/utils.js`
- Dropdown templates: `extension/templates.html`
- Localized strings: `extension/_locales/*/messages.json`
- Firefox-specific changes: `firefox/manifest.json`

## Validation

- After code changes, run `npm run lint` and fix relevant errors before finishing.
- When modifying provider logic, verify both `apiProvider: "gemini"` and `apiProvider: "openai"` paths still work.
- When updating the extension version, update both `extension/manifest.json` and `firefox/manifest.json`.

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
