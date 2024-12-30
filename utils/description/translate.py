import google.generativeai
import os
import time


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

    google.generativeai.configure(
        api_key=os.environ.get("GEMINI_API_KEY", "")
    )

    with open("description_en.txt", 'r') as f:
        description = f.read()

    for languageCode, languageName in languageList.items():
        print(languageCode, languageName)
        time.sleep(5)

        system_instruction = f"Translate the following content to {languageName} in a formal tone. " \
            "The word \"Gemini\" must be left in English. " \
            "Output in plain text without using Markdown."

        model = google.generativeai.GenerativeModel(
            model_name="gemini-2.0-flash-exp",
            system_instruction=system_instruction,
            generation_config={
                "temperature": 0.0
            }
        )

        try:
            response = model.generate_content(description)
            translated_text = response.candidates[0].content.parts[0].text
            os.makedirs("output", exist_ok=True)

            with open(f"output/description_{languageCode}.txt", 'w') as f:
                f.write(translated_text)
        except Exception as e:
            print("Failed to generate content:", e)


if __name__ == '__main__':
    main()
