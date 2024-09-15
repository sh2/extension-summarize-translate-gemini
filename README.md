# extension-summarize-translate-gemini

Chrome extension to summarize and translate web pages. Uses Gemini as the backend.

## Setup

This extension can be installed from [Chrome Web Store](https://chromewebstore.google.com/detail/hmdcbbbdmfapkpdaganadiihfmdnpngi) or [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ljmmilamifhanifgbfliknbicfjllheb).
The following are instructions for manual installation, for development purposes.

1. Open 'Manage Extensions' page in Google Chrome browser.
2. Enable 'Developer mode'.
3. Click 'Load unpacked' and select `extension` directory.
4. Open 'Options' page and register the Gemini API Key, then select the language.

You can obtain a Gemini API Key from [Google AI for Developers](https://ai.google.dev/).
The extension currently uses the following models, plus several experimental models:

- Gemini 1.5 Pro: Gemini 1.5 Pro for text and images
- Gemini 1.5 Flash: Gemini 1.5 Flash for text and images
- Gemini 1.0 Pro: Gemini 1.0 Pro for text and Gemini 1.5 Flash for images

## Usage

### Summarize

Simply open a web page and click on the extension icon to summarize its content.

![Summarize](img/screenshot_summarize.png)

If a YouTube video has captions, this extension will summarize the captions.

![Summarize - YouTube](img/screenshot_youtube.png)

If you open an image file or a PDF file, this extension will summarize the currently displayed image.

![Summarize - Image](img/screenshot_image.png)

### Translate

Select the text you want to translate and click on the extension icon.

![Translate](img/screenshot_translate.png)

## License

MIT License  
Copyright (c) 2024 Sadao Hiratsuka
