# extension-summarize-translate-gemini

Chrome extension to summarize and translate web pages. Uses Gemini as the backend.

## Setup

1. Open 'Manage Extensions' page in Google Chrome browser.
2. Enable 'Developer mode'.
3. Click 'Load unpacked' and select `extension` directory.
4. Open 'Options' page and register the Gemini API Key, then select the language.

You can get the Gemini API Key from [Google AI for Developers](https://ai.google.dev/).
This extension currently uses Gemini 1.0 Pro.

## Usage

### Summarize

Open a web page and simply click on the extension icon.
This will display a summary of the page in a popup window.

![Summarize](img/screenshot_summarize.png)

### Translate

Select the text you want to translate and click on the extension icon.
This will display the translation result in a popup window.

![Translate](img/screenshot_translate.png)

## License

MIT License  
Copyright (c) 2024 Sadao Hiratsuka
