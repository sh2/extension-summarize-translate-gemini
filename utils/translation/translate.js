import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5.4-mini";
const MAX_RETRIES = 3;
const DELAY_MS = 1000;

const LANGUAGES = {
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt_BR: "Brazilian Portuguese",
  vi: "Vietnamese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  bn: "Bengali",
  zh_CN: "Simplified Chinese",
  zh_TW: "Traditional Chinese",
  ja: "Japanese",
  ko: "Korean",
};

const SYSTEM_INSTRUCTION_TEMPLATE =
  "Translate the following content into {languageName} using a formal tone. " +
  "Keep the word Gemini in English. " +
  "Output in plain text without using Markdown.";

async function callOpenAI(apiKey, systemInstruction, userContent) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function retry(fn, maxRetries) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) {
        const wait = Math.pow(2, i) * 1000;
        console.error(`  Retry ${i + 1}/${maxRetries - 1} in ${wait}ms: ${e.message}`);
        await setTimeout(wait);
      }
    }
  }
  throw lastError;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const description = await readFile("description_en.txt", "utf-8");

  const failures = [];

  for (const [code, name] of Object.entries(LANGUAGES)) {
    console.log(`${code} ${name}`);
    const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE.replace("{languageName}", name);

    try {
      const text = await retry(
        () => callOpenAI(apiKey, systemInstruction, description),
        MAX_RETRIES
      );
      if (text) {
        await mkdir("output", { recursive: true });
        await writeFile(`output/description_${code}.txt`, text, "utf-8");
      } else {
        console.error(`  No text returned for ${code}`);
        failures.push(code);
      }
    } catch (e) {
      console.error(`  Failed: ${e.message}`);
      failures.push(code);
    }

    await setTimeout(DELAY_MS);
  }

  if (failures.length > 0) {
    console.error(`\nFailed languages: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main();
