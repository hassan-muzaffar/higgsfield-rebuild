import "server-only";
import { GenerateVideosOperation, GoogleGenAI } from "@google/genai";
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

function toProviderError(error: unknown, medium: "image" | "video" = "image") {
  const Medium = medium === "image" ? "Image" : "Video";
  const { status, body } = error as { status?: number; body?: unknown };
  // The SDK's own message hides the provider's explanation; the raw body has it.
  const message = [error instanceof Error ? error.message : String(error), typeof body === "string" ? body : ""]
    .filter(Boolean)
    .join(" | ");
  if (status === 401 || status === 402 || status === 403) {
    // Billing, quota or key problems are on our side, not the user's.
    return new ProviderError(`${Medium} generation is temporarily unavailable. Your credits were refunded.`, message);
  }
  if (status === 429) {
    return new ProviderError(`The ${medium} service is busy right now. Your credits were refunded, so please try again in a minute.`, message);
  }
  if (status === 400 && /safety|block|policy/i.test(message)) {
    return new ProviderError("Blocked by the safety filter. Try rephrasing your prompt. Your credits were refunded.", message);
  }
  return new ProviderError(`The ${medium} couldn't be generated. Your credits were refunded.`, message);
}

type VideoRequest = {
  prompt: string;
  aspectRatio: string;
  durationSeconds: number;
  /** Optional first frame to animate. */
  startFrame?: { data: Buffer; mimeType: string };
};

/** Starts a video job and returns the provider's operation name. */
export async function startVideo({ prompt, aspectRatio, durationSeconds, startFrame }: VideoRequest) {
  try {
    const operation = await google().models.generateVideos({
      model: MODELS.video,
      prompt,
      image: startFrame ? { imageBytes: startFrame.data.toString("base64"), mimeType: startFrame.mimeType } : undefined,
      config: {
        aspectRatio,
        durationSeconds,
        resolution: "720p",
        numberOfVideos: 1,
        // Image-to-video only allows adult people.
        ...(startFrame ? { personGeneration: "allow_adult" } : {}),
      },
    });
    if (!operation.name) throw new Error("Video operation has no name");
    return operation.name;
  } catch (error) {
    throw toProviderError(error, "video");
  }
}

export type VideoStatus =
  | { done: false }
  | { done: true; video: { data: Buffer; mimeType: string } };

/** Checks a video job once. Returns the MP4 when it's ready; throws ProviderError if it failed. */
export async function checkVideo(operationName: string): Promise<VideoStatus> {
  const pending = new GenerateVideosOperation();
  pending.name = operationName;

  let operation;
  try {
    operation = await google().operations.getVideosOperation({ operation: pending });
  } catch (error) {
    // A failed status check doesn't mean the video failed: check again next time.
    // If it never recovers, the stale-job sweeper refunds it after 15 minutes.
    console.warn(`[video ${operationName}] status check failed, will retry:`, error);
    return { done: false };
  }
  if (!operation.done) return { done: false };

  const response = operation.response;
  const video = response?.generatedVideos?.[0]?.video;
  if (operation.error || !video) {
    const detail = JSON.stringify(operation.error ?? response?.raiMediaFilteredReasons ?? "no video");
    if (response?.raiMediaFilteredCount || /safety|block|policy|filter/i.test(detail)) {
      throw new ProviderError(
        "Blocked by the safety filter. Try rephrasing your prompt or using a different image. Your credits were refunded.",
        detail,
      );
    }
    throw new ProviderError("The video couldn't be generated. Your credits were refunded.", detail);
  }

  if (video.videoBytes) {
    return { done: true, video: { data: Buffer.from(video.videoBytes, "base64"), mimeType: video.mimeType ?? "video/mp4" } };
  }
  if (!video.uri) throw new ProviderError("The video couldn't be downloaded. Your credits were refunded.");

  // The file link needs the API key; it's kept on the provider for 2 days.
  const res = await fetch(video.uri, { headers: { "x-goog-api-key": process.env.GOOGLE_AI_API_KEY ?? "" } });
  if (!res.ok) {
    throw new ProviderError("The video couldn't be downloaded. Your credits were refunded.", `download ${res.status}`);
  }
  return { done: true, video: { data: Buffer.from(await res.arrayBuffer()), mimeType: "video/mp4" } };
}
