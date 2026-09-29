import "server-only";
import { GoogleGenAI } from "@google/genai";
import { MODELS } from "@/lib/ai/models";

let client: GoogleGenAI | null = null;

function google() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** A failure that is safe and useful to show the user as-is. */
export class ProviderError extends Error {
  constructor(
    public readonly userMessage: string,
    detail?: string,
  ) {
    super(detail ?? userMessage);
  }
}

type ImageRequest = {
  prompt: string;
  aspectRatio: string;
  /** Optional reference image to edit. */
  reference?: { data: Buffer; mimeType: string };
};

/** Generates (or edits) one image. Returns JPEG bytes. */
export async function generateImage({ prompt, aspectRatio, reference }: ImageRequest) {
  let interaction;
  try {
    interaction = await google().interactions.create({
      model: MODELS.image,
      input: reference
        ? [
            { type: "text", text: prompt },
            { type: "image", mime_type: reference.mimeType, data: reference.data.toString("base64") },
          ]
        : prompt,
      // The model only returns JPEG.
      response_format: { type: "image", aspect_ratio: aspectRatio, mime_type: "image/jpeg" },
      store: false,
    });
  } catch (error) {
    throw toProviderError(error);
  }

  const image = interaction.output_image ?? findImage(interaction.steps);
  if (interaction.status === "completed" && image?.data) {
    return { data: Buffer.from(image.data, "base64"), mimeType: image.mime_type ?? "image/jpeg" };
  }

  const detail = [interaction.status, ...(interaction.errors ?? []).map((e) => `${e.code}: ${e.message}`)].join(" ");
  if (/safety|block|prohibit|policy/i.test(detail) || (interaction.status === "completed" && !image)) {
    throw new ProviderError(
      "Blocked by the safety filter. Try rephrasing your prompt. Your credits were refunded.",
      detail,
    );
  }
  throw new ProviderError("The image couldn't be generated. Your credits were refunded.", detail);
}

type OutputStep = { type: string; content?: Array<{ type: string; data?: string; mime_type?: string }> };

function findImage(steps: OutputStep[] | undefined) {
  for (const step of steps ?? []) {
    if (step.type !== "model_output") continue;
    const image = step.content?.find((c) => c.type === "image");
    if (image) return image;
  }
  return undefined;
}

function toProviderError(error: unknown) {
  const { status, body } = error as { status?: number; body?: unknown };
  // The SDK's own message hides the provider's explanation; the raw body has it.
  const message = [error instanceof Error ? error.message : String(error), typeof body === "string" ? body : ""]
    .filter(Boolean)
    .join(" | ");
  if (status === 401 || status === 402 || status === 403) {
    // Billing, quota or key problems are on our side, not the user's.
    return new ProviderError("Image generation is temporarily unavailable. Your credits were refunded.", message);
  }
  if (status === 429) {
    return new ProviderError("The image service is busy right now. Your credits were refunded, so please try again in a minute.", message);
  }
  if (status === 400 && /safety|block|policy/i.test(message)) {
    return new ProviderError("Blocked by the safety filter. Try rephrasing your prompt. Your credits were refunded.", message);
  }
  return new ProviderError("The image couldn't be generated. Your credits were refunded.", message);
}
