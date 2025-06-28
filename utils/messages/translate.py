import json
import os
import time
from google import genai
from google.genai.types import Content, GenerateContentConfig, Part


def main():
    languageList = {
        "de": "German",
        "es": "Spanish",
        "fr": "French",
        "it": "Italian",
        "pt_BR": "Brazilian Portuguese",
        "vi": "Vietnamese",
        "ru": "Russian",
        "ar": "Arabic",
        "hi": "Hindi",
        "bn": "Bengali",
        "zh_CN": "Simplified Chinese",
        "zh_TW": "Traditional Chinese",
        "ko": "Korean"
    }

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

    with open("../../extension/_locales/en/messages.json", 'r') as f:
        messages = f.read()

    for languageCode, languageName in languageList.items():
        print(languageCode, languageName)
        time.sleep(5)

        system_instruction = f"Translate the following JSON content into {languageName} using a formal tone. " \
            "For the purpose of displaying the Chrome Extension user interface, provide concise and consistent translations. " \
            "Keep the word Gemini in English."

        config = GenerateContentConfig(
            response_mime_type="application/json",
            system_instruction=system_instruction,
            temperature=0.0
        )

        contents = [
            Content(
                role="user",
                parts=[Part.from_text(text=messages)]
            )
        ]

        try:
            response = client.models.generate_content(
                config=config,
                contents=contents,
                model="gemini-2.5-flash"
            )

            if response.text:
                json_obj = json.loads(response.text)
                json_text = json.dumps(json_obj, indent=4, ensure_ascii=False)
                os.makedirs(f"output/{languageCode}", exist_ok=True)

                with open(f"output/{languageCode}/messages.json", 'w') as f:
                    f.write(json_text)
            else:
                print("No text returned in response.")
        except Exception as e:
            print("Failed to generate content:", e)


if __name__ == '__main__':
    main()
