import "server-only";
import OpenAI, { toFile } from "openai";
import { MODELS } from "@/lib/ai/models";
import { ProviderError } from "@/lib/ai/google";

let client: OpenAI | null = null;

function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  client ??= new OpenAI({ apiKey });
  return client;
}

/** Turns text into an MP3 voiceover. */
export async function synthesizeSpeech({ text, voice, instructions }: { text: string; voice: string; instructions: string }) {
  try {
    const response = await openai().audio.speech.create({
      model: MODELS.voice,
      voice,
      input: text,
      instructions,
      response_format: "mp3",
    });
    return { data: Buffer.from(await response.arrayBuffer()), mimeType: "audio/mpeg" };
  } catch (error) {
    throw toProviderError(error, "voiceover");
  }
}

/** Transcribes a short recording (webm, mp4, m4a, wav or mp3) to text. */
export async function transcribe(audio: Blob) {
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("wav") ? "wav" : audio.type.includes("mpeg") ? "mp3" : "webm";
  try {
    const result = await openai().audio.transcriptions.create({
      model: MODELS.transcribe,
      file: await toFile(audio, `dictation.${ext}`, { type: audio.type || "audio/webm" }),
    });
    return result.text.trim();
  } catch (error) {
    throw toProviderError(error, "transcription");
  }
}

function toProviderError(error: unknown, what: string) {
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  const detail = error instanceof Error ? error.message : String(error);
  if (status === 401 || status === 402 || status === 403 || (status === 429 && /quota|billing/i.test(detail))) {
    return new ProviderError(`The ${what} service is temporarily unavailable. Your credits were refunded.`, detail);
  }
  if (status === 429) {
    return new ProviderError(`The ${what} service is busy right now. Your credits were refunded, so please try again in a minute.`, detail);
  }
  if (status === 400 && /safety|policy|moderation/i.test(detail)) {
    return new ProviderError("Blocked by the safety filter. Try rephrasing. Your credits were refunded.", detail);
  }
  return new ProviderError(`The ${what} couldn't be created. Your credits were refunded.`, detail);
}
