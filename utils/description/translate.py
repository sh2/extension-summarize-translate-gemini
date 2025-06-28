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
        "ja": "Japanese",
        "ko": "Korean"
    }

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

    with open("description_en.txt", 'r') as f:
        description = f.read()

    for languageCode, languageName in languageList.items():
        print(languageCode, languageName)
        time.sleep(5)

        system_instruction = f"Translate the following content into {languageName} using a formal tone. " \
            "Keep the word Gemini in English. " \
            "Output in plain text without using Markdown."

        config = GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.0
        )

        contents = [
            Content(
                role="user",
                parts=[Part.from_text(text=description)]
            )
        ]

        try:
            response = client.models.generate_content(
                config=config,
                contents=contents,
                model="gemini-2.5-flash"
            )

            if response.text:
                os.makedirs("output", exist_ok=True)

                with open(f"output/description_{languageCode}.txt", 'w') as f:
                    f.write(response.text)
            else:
                print("No text returned in response.")
        except Exception as e:
            print("Failed to generate content:", e)


if __name__ == '__main__':
    main()
