# AGENTS.md

## Project overview

Cross-browser extension (Chrome, Firefox, Edge) that uses Google Gemini API to summarize and translate web pages. Also supports YouTube caption summarization, image/PDF summarization, follow-up questions, custom actions, and streaming LLM output.

- **Platform:** Chrome Extension Manifest V3
- **Language:** Vanilla JavaScript (ES modules) — no TypeScript, no bundler, no framework
- **API backend:** Google Gemini (`generativelanguage.googleapis.com/v1beta`)
- **Version:** 1.7.9 (in `extension/manifest.json` and `firefox/manifest.json`)

## Directory structure

| Path | Purpose |
| --- | --- |
| `extension/` | Extension source (loaded as unpacked extension in developer mode) |
| `extension/service-worker.js` | Background worker — API calls to Gemini, context menus, keyboard shortcuts, result caching |
| `extension/popup.html` + `popup.js` | Extension popup UI — extracts page text/captions/images, displays results |
| `extension/options.html` + `options.js` | Options page — API key, model selection, language, custom actions, themes |
| `extension/results.html` + `results.js` | Standalone results tab — follow-up conversation, streaming display |
| `extension/utils.js` | Shared utilities — model configs, Gemini API calls (generate + stream), fallback logic, theme/font, markdown rendering, context menus |
| `extension/templates.html` | HTML `<template>` elements for language model and language code dropdowns |
| `extension/_locales/` | 15 locale directories (ar, bn, de, en, es, fr, hi, it, ja, ko, pt_BR, ru, vi, zh_CN, zh_TW), each with `messages.json` |
| `extension/lib/` | 3 minified vendor libraries: `marked.umd.min.js`, `purify.min.js`, `Readability.min.js` — **do not edit** |
| `extension/css/` | `common.css` (theme/font-size variables, layout) + `new.min.css` (new.css framework) |
| `firefox/` | Firefox-specific manifest override — adds `browser_specific_settings` and uses `scripts` array instead of `service_worker` |
| `utils/` | Python scripts using `google-genai` SDK to auto-translate extension strings |
| `img/` | README screenshots |

## Development setup

1. Node.js required only for ESLint (no runtime dependency)
2. `npm install` — installs ESLint and globals
3. `npm run lint` — runs ESLint on the entire repository
4. Load `extension/` as an unpacked extension in Chrome developer mode

## Coding conventions

All conventions are enforced by ESLint. See `eslint.config.mjs` for the full config. Key rules:

- Double quotes (`"`) required
- Semicolons (`;`) required
- `@eslint/js/recommended` rules apply
- Browser globals (`window`, `document`, etc.) and WebExtensions globals (`chrome`, `browser`) are pre-declared
- Minified vendor files in `extension/lib/` are excluded from linting

## Instructions for AI tools

- **After any code change, run `npm run lint` and fix all errors before considering the task complete.**
- The extension source lives entirely under `extension/`. `firefox/` contains only a manifest override.
- Do not edit files in `extension/lib/` — they are third-party minified libraries.
- `extension/` is the root of the unpacked extension. `manifest.json` defines the extension structure, permissions, and content scripts.
- When updating the version, update both `extension/manifest.json` and `firefox/manifest.json`.
- Translations in `_locales/*/messages.json` are managed by Python scripts in `utils/messages/`.
