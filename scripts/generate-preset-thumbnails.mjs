// Generates the preset thumbnails in public/presets/ (9 images, ~$0.35). Every style shows the same
// subject so the styles are easy to compare. Re-run only when presets change. Run: pnpm presets:thumbnails
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SUBJECT = "a red fox sitting on a mossy rock in an autumn forest";
const SYSTEM = "You are an image generator. Always respond with a single image. Never respond with text.";

async function image(prompt, aspect, file) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await ai.interactions.create({ model: "gemini-3.1-flash-image", system_instruction: SYSTEM, input: prompt, response_format: { type: "image", aspect_ratio: aspect, mime_type: "image/jpeg" }, store: false });
    if (r.output_image?.data) {
      writeFileSync(`public/presets/${file}`, Buffer.from(r.output_image.data, "base64"));
      return console.log(`${file}: ok`);
    }
  }
  console.log(`${file}: FAILED`);
}

const { data: presets } = await admin.from("presets").select("slug, prompt_template").eq("kind", "image");
await Promise.all([
  ...presets.map((p) => image(p.prompt_template.replace("{prompt}", SUBJECT), "1:1", `${p.slug}.jpg`)),
  image("A lone hiker standing on a mountain ridge at sunrise above a sea of clouds, wide cinematic landscape", "16:9", "camera-sample.jpg"),
]);
