// Generates the short voice preview clips in public/voices/ (one per voice, a fraction of a cent each).
// Re-run only when the voice list in src/lib/generations/config.ts changes. Run: pnpm voices:samples
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const OpenAI = require("openai").default;

const VOICES = ["marin", "cedar", "coral", "nova", "sage", "ash", "onyx", "verse"];
const TEXT = "Hi, I'm one of the OneShot voices. Type a script and I'll bring it to life.";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

for (const voice of VOICES) {
  const res = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: TEXT,
    instructions: "Speak naturally and clearly, at a relaxed pace.",
    response_format: "mp3",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/voices/${voice}.mp3`, buf);
  console.log(`${voice}: ${(buf.length / 1024).toFixed(0)} KB`);
}
