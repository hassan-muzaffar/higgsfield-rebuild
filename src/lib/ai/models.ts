// Every provider model ID lives here. Check the provider docs before changing one:
// Gemini: https://ai.google.dev/gemini-api/docs · OpenAI: https://developers.openai.com/api/docs
export const MODELS = {
  image: "gemini-3.1-flash-image",
  // Veo 3.1 Fast: cheaper and quicker than standard Veo 3.1, still with native audio.
  video: "veo-3.1-fast-generate-preview",
  // OpenAI's newest TTS model; supports speaking-style instructions.
  voice: "gpt-4o-mini-tts",
  transcribe: "gpt-transcribe",
  // Fastest, cheapest current Gemini text model: rewrites short prompts.
  enhance: "gemini-3.5-flash-lite",
} as const;
