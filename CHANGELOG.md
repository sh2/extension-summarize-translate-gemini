# Changelog

<!-- markdownlint-disable MD024 -- Each version repeats the same section names. -->

All notable changes to this project are documented in this file.

The changelog covers every released version, starting from the first
tagged release, 1.0.0. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.22] - 2026-10-10

### Fixed

- Summarizing or asking follow-up questions with OpenCode Go through the
  OpenAI-compatible setting failed with HTTP 400 because the service now
  requires an `x-opencode-session` header. Requests to OpenCode Go endpoints
  now include a stable session ID per conversation.

## [1.8.21] - 2026-10-04

### Added

- `max` and `minimal` options for the OpenAI-compatible reasoning effort
  setting.

### Changed

- The default OpenAI-compatible model is now `gpt-6-luna`.
- The translation helper script uses `gpt-6-luna` as well.

### Removed

- Gemini 3.1 Flash-Lite and Gemini 3 Flash from the model selector.

## [1.8.20] - 2026-09-23

### Added

- Source headers for copied and saved content. The page title and URL are
  now prepended to both the clipboard copy and the saved file so that the
  result keeps its attribution (#50).
- The source URL is rendered as a clickable link in pasted HTML when it
  uses `http` or `https`, and stays plain text otherwise.

### Changed

- Header generation is centralized in a single helper shared by the popup
  and the results page, so the copied text and the saved file no longer
  drift apart.
- The source title is emitted as a bold paragraph instead of a heading, so
  the attribution line does not look oversized in Word and Gmail.
- Right-to-left content keeps its direction in the pasted HTML
  (`dir="auto"` is preserved on the header elements).

## [1.8.19] - 2026-09-21

### Added

- Rich text clipboard copy. Copy now writes both plain text and HTML, so
  pasting into a rich text editor keeps the formatting of the result and
  the follow-up conversation (#50).
- Plain text clipboard writes are still used automatically on browsers
  without HTML clipboard support.

### Changed

- Question styling on the results page moved from inline JavaScript to the
  page's stylesheet, so the copied HTML stays consistent.
- Inline attachment previews are removed from the copied HTML so that the
  copy stays text only, matching the plain text output. Images referenced
  by a URL are kept.

### Fixed

- Attachment preview wrappers are now removed together with their images,
  preventing empty block elements from remaining in the clipboard content.

## [1.8.18] - 2026-09-05

### Added

- Gemini 3.8 Flash support, with thinking level options (high, medium, and
  low).
- Gemini 3.8 Flash is now the first model in the automatic fallback chain.

## [1.8.17] - 2026-08-29

### Fixed

- Page text extraction now falls back to `document.body.innerText` when
  Readability returns only a short fragment. This avoids losing content on
  comment-heavy pages such as Reddit threads.

## [1.8.16] - 2026-08-22

### Changed

- The popup header stays stable when the viewport width changes.
- Cleaned up the results page layout.

## [1.8.15] - 2026-08-20

### Changed

- Body width is now responsive across `common.css` and the results page.

## [1.8.14] - 2026-08-15

### Changed

- Added Gemini 3.7 Flash with thinking level options (High, Medium, and
  Low). The automatic fallback chain now starts with Gemini 3.7 Flash.
- Updated the OpenAI-compatible model references to GPT-5.6.

## [1.8.13] - 2026-08-02

### Fixed

- Emphasis in CJK text that contains brackets is now rendered correctly.
- The save status no longer wraps awkwardly on narrow screens.

### Changed

- Streamlined task input validation and updated the built-in summary and
  translation prompts.

## [1.8.12] - 2026-07-25

### Added

- Status messages are now announced by screen readers through ARIA live
  regions.

### Changed

- Status message styling moved from inline styles to stylesheet classes on
  the popup, results, and options pages.

### Fixed

- Adjusted the content security policy in the extension and Firefox
  manifests so that the pages load correctly.

## [1.8.11] - 2026-07-23

### Added

- Gemini 3.6 Flash and Gemini 3.5 Flash-Lite model options.

### Fixed

- Host permission requests for the OpenAI-compatible API on Firefox
  (#47).

## [1.8.10] - 2026-07-20

### Added

- Options page reorganised into sections, with theme selection and
  backup/restore (export and import) actions.
- Localized labels and error messages for the new options sections.

### Security

- Markdown links and images are now validated: only `http` and `https`
  URLs are kept, and other schemes are removed before rendering.

## [1.8.9] - 2026-06-28

### Changed

- Increased the backoff intervals used when retrying requests to the
  Gemini API.

## [1.8.8] - 2026-06-28

### Added

- Automatic retry with backoff when the Gemini API returns HTTP 503.
- Retry progress is now shown as a status message while a request is
  being retried (#45).

## [1.8.7] - 2026-06-27

### Added

- Image attachments for follow-up questions on the results page (#42).
- The language model version used for a result is now carried to the
  results page and stored with the cached response.

### Fixed

- Corrected the Japanese label for the image attachment button.

## [1.8.6] - 2026-06-21

### Added

- Option to always open results in a new tab, with a popup notice and
  reuse of the existing results tab (#45).

## [1.8.5] - 2026-06-20

### Added

- Saved files now begin with the page title and URL.

### Changed

- System prompts updated so that follow-up questions work correctly for
  summarization and translation results.
- Updated the vendored third-party libraries.

## [1.8.4] - 2026-06-08

### Fixed

- The copy and save actions now handle errors and incomplete
  conversations gracefully.

### Changed

- Reorganised utility, options, and service worker code for
  maintainability.

## [1.8.3] - 2026-05-20

### Changed

- Added Gemini 3.5 Flash options (High, Medium, Low, and Minimal) and
  made it the first model in the automatic fallback chain.
- Removed Gemma 3 27B and the older Gemini 2.5 entries from the model
  list.

## [1.8.2] - 2026-05-08

### Changed

- Gemini 3.1 Flash-Lite is no longer labelled as a preview, and the
  default language model was updated.

## [1.8.1] - 2026-05-06

### Added

- Reasoning effort (`reasoning_effort`) and thinking type
  (`thinking.type`) settings for the OpenAI-compatible provider.
- A hint in the options page explaining the reasoning controls.

### Changed

- Updated the extension description to mention OpenAI API compatibility.

## [1.8.0] - 2026-05-02

### Added

- Support for OpenAI-compatible APIs as an alternative provider,
  including API key and Base URL settings, provider-aware content
  generation, and streaming.
- Host permission handling for a custom Base URL, with a save prompt and
  CORS guidance.
- A model dropdown for OpenAI models, with localized labels and
  validation messages for an invalid Base URL.

### Changed

- Removed the built-in default OpenAI Base URL and the default model
  IDs; both must be configured by the user.

## [1.7.9] - 2026-04-11

### Changed

- Updated the YouTube transcript renderer selector for better
  compatibility (#44).

## [1.7.8] - 2026-04-04

### Changed

- Updated the Gemma model options and descriptions.
- Reworked the logic that enables and disables the popup and results
  controls.

## [1.7.7] - 2026-03-28

### Changed

- YouTube transcript retrieval now reads from the
  `yt-section-list-renderer` element for better compatibility (#41).

## [1.7.6] - 2026-03-08

### Changed

- YouTube transcript retrieval now supports multiple renderer variants
  (#41).

## [1.7.5] - 2026-03-08

### Changed

- Reworked YouTube transcript retrieval for better reliability and
  performance (#41).

## [1.7.4] - 2026-03-08

### Changed

- Default language model changed to Gemini 3.1 Flash-Lite Preview, with
  thinking level options.
- Removed the deprecated Gemini 3 Pro options.

## [1.7.3] - 2026-03-08

### Changed

- Improved error messages and status feedback in the popup and the
  results page (#31).

## [1.7.2] - 2026-03-08

### Added

- Gemini 3.1 Pro model options.

### Changed

- The default language model is now defined in a single constant.
- Removed the deprecated Gemini model options.

## [1.7.1] - 2026-01-17

### Changed

- Improved YouTube transcript retrieval with better selectors and error
  handling.
- The transcript panel is now closed again after reading if the
  extension opened it.

### Fixed

- Removed a redundant content assignment in the main flow.

## [1.7.0] - 2026-01-03

### Added

- A hint in the options page explaining the Auto-fallback model setting.

### Changed

- Reworked fallback handling in content generation, using
  `gemini-2.5-flash` as the user model ID.

### Fixed

- YouTube caption extraction now detects all video URL formats.

## [1.6.37] - 2025-12-28

### Added

- Gemini 3 Flash model options.

### Changed

- Removed the protobuf-based transcript extraction and simplified the
  YouTube transcript retrieval (#37).

## [1.6.36] - 2025-11-22

### Changed

- Updated the thinking budget handling to support the latest model
  configuration options.

## [1.6.35] - 2025-11-02

### Added

- Option to render URLs in results as clickable hyperlinks (#32).

## [1.6.34] - 2025-11-02

### Fixed

- The question input is now read-only, instead of disabled, while a
  question is being processed, so its content stays selectable (#33).

## [1.6.33] - 2025-10-30

### Added

- Ctrl/Cmd+Enter now sends a follow-up question (#30).

## [1.6.32] - 2025-10-05

### Changed

- Character limits are now cached, and new language model options were
  added.

## [1.6.31] - 2025-09-28

### Changed

- Improved how the context menu for custom actions is created, and
  updated its labels.

## [1.6.30] - 2025-09-22

### Added

- Option to automatically save results after generation (#23).

## [1.6.29] - 2025-09-21

### Added

- Save button that exports the result to a file, with status messages in
  every supported language.

### Fixed

- The exported filename now uses the plural form `results`.

## [1.6.28] - 2025-09-15

### Fixed

- Reworked streaming session storage using a `streamKey` parameter,
  improving the reliability of streamed responses (#24).

## [1.6.27] - 2025-08-16

### Changed

- Updated the Gemini model mappings and removed deprecated models.

## [1.6.26] - 2025-07-26

### Fixed

- Removed an unnecessary scroll-to-bottom action in the popup and the
  results page (#21).

## [1.6.25] - 2025-07-23

### Changed

- Updated the Gemini 2.5 Flash-Lite references and removed the preview
  variant.

## [1.6.24] - 2025-06-29

### Changed

- YouTube caption requests now use an updated client version.
- Removed the deprecated custom prompt options.
- Documentation updated to reflect Gemini 2.5 Flash as the default
  model.

## [1.6.23] - 2025-06-19

### Changed

- Default model updated to Gemini 2.5 Flash, with new Gemini 2.5
  options.

## [1.6.22] - 2025-06-15

### Changed

- Updated the protobuf build instructions used for video metadata.

## [1.6.21] - 2025-06-15

### Changed

- YouTube caption retrieval now encodes video metadata with protobuf
  (#18).

## [1.6.20] - 2025-06-08

### Added

- A status message shown while YouTube captions are retrieved.

### Changed

- Simplified the caption retrieval logic (#18).

## [1.6.19] - 2025-06-06

### Changed

- Updated the model names and options for consistency.

## [1.6.18] - 2025-06-01

### Added

- A prompt and a link to set up the API key when it is not configured
  yet.

### Changed

- The API key hint now points to Google AI Studio.
- YouTube caption requests can now be made with or without credentials
  (#18).

## [1.6.17] - 2025-05-22

### Added

- New language model options, with a default when none is selected.

### Changed

- Refined the translation instructions for a more consistent formal
  tone.

## [1.6.16] - 2025-05-18

### Fixed

- Corrected translations and improved phrasing in several languages.

## [1.6.15] - 2025-05-18

### Fixed

- Restoring options from cloud sync no longer overwrites the saved
  settings with default values (#16).

## [1.6.14] - 2025-05-18

### Added

- Cloud sync and restore for the extension options, with an improved
  export and import flow (#16).

## [1.6.13] - 2025-05-11

### Added

- Thinking budget support for content generation, with updated model
  options.

## [1.6.12] - 2025-04-29

### Fixed

- Streaming requests now handle error responses correctly.

## [1.6.11] - 2025-04-26

### Changed

- Layout is now handled entirely by CSS so that the pages adapt to the
  screen size (#15).

## [1.6.10] - 2025-04-19

### Added

- Gemini 2.5 Flash Preview 04-17 model option.

## [1.6.9] - 2025-04-12

### Added

- Customizable labels for the context menu actions.

## [1.6.8] - 2025-04-06

### Added

- Font size option for the extension UI.
- Gemini 2.5 Pro Preview model support.

## [1.6.7] - 2025-03-26

### Added

- Gemini 2.5 Pro Experimental model support.

## [1.6.6] - 2025-03-16

### Fixed

- The extension now checks whether `chrome.commands` and
  `chrome.contextMenus` are available, avoiding errors on Firefox.

## [1.6.5] - 2025-03-16

### Added

- Export and import of the options as a file.

### Changed

- Improved the accessibility of the settings page by using `label`
  elements for the controls.

## [1.6.4] - 2025-03-13

### Added

- Gemma 3 27B model support.

## [1.6.3] - 2025-03-11

### Changed

- Centralized Markdown-to-HTML conversion in a shared utility function.

## [1.6.2] - 2025-03-09

### Added

- Option to register the context menu from the settings page.

## [1.6.1] - 2025-02-26

### Changed

- Added Gemini 2.0 Flash-Lite and removed the deprecated model options.
- Improved the restoration of the default prompts for custom actions.

## [1.6.0] - 2025-02-24

### Added

- Custom actions: user-defined prompts that can be run from the settings
  page and from the context menu (desktop only).

### Fixed

- Fixed the popup opening from the keyboard shortcut listener, and made
  the session state handling reliable.

## [1.5.11] - 2025-02-09

### Added

- Option to enter a custom model ID.

### Changed

- Default language model updated to Gemini 2.0 Flash.

## [1.5.10] - 2025-02-01

### Fixed

- Streaming responses are now checked before their candidates are
  concatenated.

## [1.5.9] - 2025-01-26

### Added

- Copy button in the popup, with a confirmation message.

## [1.5.8] - 2025-01-24

### Fixed

- Improved the concatenation of streamed candidates and the buffer
  handling (#8).

## [1.5.7] - 2025-01-22

### Fixed

- The results page now scrolls to the bottom only when needed while
  streaming, and the streaming loop terminates correctly.

## [1.5.6] - 2025-01-19

### Added

- Streaming output option, which shows the response as it is generated.

## [1.5.5] - 2025-01-18

### Fixed

- Added error handling for the case where page information cannot be
  extracted.

## [1.5.4] - 2025-01-13

### Added

- Theme selection (light or dark) for the extension UI.

## [1.5.3] - 2025-01-04

### Changed

- Added support for the `zz` language code when retrieving YouTube
  captions.
- Reworked the response cache in session storage.

## [1.5.2] - 2024-12-31

### Added

- Option to specify the language manually.

## [1.5.1] - 2024-12-28

### Fixed

- Corrected the response handling in the service worker.

## [1.5.0] - 2024-12-27

### Added

- Follow-up questions on the results page, with a question input, a
  send button, and a language model selector.
- Clear conversation button.
- Localized error messages for blocked prompts and unexpected
  responses.

### Changed

- Reworked the loading message display and the result handling.
- The results page layout now adapts to narrow screens.

## [1.4.6] - 2024-12-12

### Added

- Gemini 2.0 Flash Experimental model option.

## [1.4.5] - 2024-12-07

### Changed

- Replaced the Gemini Exp-1114 option with Exp-1206 in the model list.

## [1.4.4] - 2024-11-23

### Added

- Gemini Exp-1121 model option.

## [1.4.3] - 2024-11-16

### Changed

- Added the Gemini Exp-1114 option.
- Updated the harm category classifications for better content
  filtering.
- Removed the deprecated Gemini 1.0 Pro model references.

## [1.4.2] - 2024-10-14

### Fixed

- YouTube mobile URLs (`m.youtube.com`) are now recognised for caption
  summarization.

## [1.4.1] - 2024-10-06

### Added

- Gemini 1.5 Flash-8B model option.

### Changed

- The popup, results, and options pages now use a responsive design.

## [1.3.12] - 2024-09-28

### Security

- Added the DOMPurify library to sanitize the HTML rendered from
  Markdown.

## [1.3.11] - 2024-09-28

### Changed

- Updated the Gemini model versions used in the extension.

## [1.3.10] - 2024-09-15

### Added

- Keyboard shortcut for running the summarize or translate action.

## [1.3.9] - 2024-08-31

### Changed

- Updated the language model options and set a default value.

## [1.3.8] - 2024-08-05

### Changed

- Updated the Gemini language model options.

## [1.3.7] - 2024-06-21

### Changed

- Updated the Gemini language model options.
- Refined the translation instructions to use a formal tone.

## [1.3.6] - 2024-06-15

### Added

- Bengali and Hindi UI languages.

## [1.3.5] - 2024-06-13

### Added

- Arabic UI language.

## [1.3.4] - 2024-06-13

### Fixed

- Corrected the language model ID used for image input.

## [1.3.3] - 2024-06-11

### Fixed

- The task and response caches are cleared before new content is
  generated, preventing stale results.

## [1.3.2] - 2024-06-07

### Changed

- Removed the "Preview" label from stable Gemini models and reordered
  the language list.

## [1.3.1] - 2024-05-21

### Added

- Vietnamese UI language.

### Changed

- Improved the translations for Korean, Chinese, and Brazilian
  Portuguese.

## [1.3.0] - 2024-05-16

### Changed

- Updated the available language model options and the localization
  messages.

## [1.2.1] - 2024-05-13

### Added

- Copy button for the result, with localized status messages.

## [1.2.0] - 2024-04-01

### Added

- Customizable prompts for text and image tasks: summarize, translate,
  or a custom action with your own prompt (#1).

### Changed

- Added more UI languages, including Korean and French.

### Fixed

- Corrected the response handling in the popup.

## [1.1.0] - 2024-03-18

### Added

- Image summarization: when the page contains no readable text, the
  visible tab is captured and summarized instead.

## [1.0.6] - 2024-03-17

### Added

- Language selection dropdown in the popup.

### Fixed

- Corrected a typo in the language names.

## [1.0.5] - 2024-03-10

### Added

- UI translations for German, Spanish, French, Italian, Korean,
  Portuguese (Brazil), Russian, Simplified Chinese, and Traditional
  Chinese.

## [1.0.4] - 2024-03-10

### Added

- Summarization of YouTube video captions.

## [1.0.3] - 2024-03-09

### Added

- Results page that opens the generated result in its own tab, with a
  button in the popup.

## [1.0.2] - 2024-03-06

### Changed

- Refined the character limit handling and updated the API key label on
  the settings page.

## [1.0.1] - 2024-03-03

### Changed

- Improved error handling in the popup.
- Removed the content script; page access now happens on demand.

## [1.0.0] - 2024-03-03

### Added

- Initial release. Summarize or translate the current web page with the
  Google Gemini API.
- Popup UI, an options page for the API key, and UI localization for
  English and Japanese.

[1.8.22]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.22
[1.8.21]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.21
[1.8.20]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.20
[1.8.19]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.19
[1.8.18]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.18
[1.8.17]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.17
[1.8.16]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.16
[1.8.15]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.15
[1.8.14]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.14
[1.8.13]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.13
[1.8.12]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.12
[1.8.11]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.11
[1.8.10]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.10
[1.8.9]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.9
[1.8.8]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.8
[1.8.7]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.7
[1.8.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.6
[1.8.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.5
[1.8.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.4
[1.8.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.3
[1.8.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.2
[1.8.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.1
[1.8.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.8.0
[1.7.9]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.9
[1.7.8]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.8
[1.7.7]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.7
[1.7.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.6
[1.7.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.5
[1.7.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.4
[1.7.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.3
[1.7.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.2
[1.7.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.1
[1.7.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.7.0
[1.6.37]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.37
[1.6.36]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.36
[1.6.35]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.35
[1.6.34]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.34
[1.6.33]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.33
[1.6.32]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.32
[1.6.31]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.31
[1.6.30]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.30
[1.6.29]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.29
[1.6.28]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.28
[1.6.27]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.27
[1.6.26]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.26
[1.6.25]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.25
[1.6.24]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.24
[1.6.23]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.23
[1.6.22]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.22
[1.6.21]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.21
[1.6.20]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.20
[1.6.19]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.19
[1.6.18]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.18
[1.6.17]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.17
[1.6.16]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.16
[1.6.15]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.15
[1.6.14]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.14
[1.6.13]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.13
[1.6.12]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.12
[1.6.11]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.11
[1.6.10]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.10
[1.6.9]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.9
[1.6.8]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.8
[1.6.7]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.7
[1.6.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.6
[1.6.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.5
[1.6.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.4
[1.6.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.3
[1.6.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.2
[1.6.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.1
[1.6.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.6.0
[1.5.11]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.11
[1.5.10]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.10
[1.5.9]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.9
[1.5.8]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.8
[1.5.7]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.7
[1.5.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.6
[1.5.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.5
[1.5.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.4
[1.5.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.3
[1.5.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.2
[1.5.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.1
[1.5.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.5.0
[1.4.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.6
[1.4.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.5
[1.4.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.4
[1.4.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.3
[1.4.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.2
[1.4.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.4.1
[1.3.12]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.12
[1.3.11]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.11
[1.3.10]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.10
[1.3.9]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.9
[1.3.8]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.8
[1.3.7]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.7
[1.3.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.6
[1.3.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.5
[1.3.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.4
[1.3.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.3
[1.3.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.2
[1.3.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.1
[1.3.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.3.0
[1.2.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.2.1
[1.2.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.2.0
[1.1.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.1.0
[1.0.6]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.6
[1.0.5]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.5
[1.0.4]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.4
[1.0.3]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.3
[1.0.2]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.2
[1.0.1]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.1
[1.0.0]: https://github.com/sh2/extension-summarize-translate-gemini/releases/tag/v1.0.0
