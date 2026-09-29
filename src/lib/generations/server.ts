import "server-only";
import { MODELS } from "@/lib/ai/models";
import { checkVideo, generateImage, ProviderError, startVideo } from "@/lib/ai/google";
import { synthesizeSpeech } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CREDIT_COSTS,
  videoCost,
  type ImageAspectRatio,
  type VideoAspectRatio,
  type VideoDuration,
  VOICE_STYLES,
  voiceCost,
  type VoiceId,
  type VoiceStyleId,
} from "@/lib/generations/config";
import { GENERATION_COLUMNS, type Generation, type GenerationKind, type GenerationMode } from "@/lib/generations/types";

export class GenerationRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type NewJobs = {
  userId: string;
  kind: GenerationKind;
  mode: GenerationMode;
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  inputPath?: string;
  costEach: number;
  count: number;
  parentId?: string;
};

/** Charges credits and creates queued jobs in one transaction. */
async function createJobs(input: NewJobs): Promise<Generation[]> {
  const admin = createAdminClient();

  if (input.inputPath) {
    // Only the owner's own uploads may be used as an input.
    if (!input.inputPath.startsWith(`${input.userId}/`)) {
      throw new GenerationRequestError("That image isn't yours.", 403);
    }
    const [folder, name] = splitPath(input.inputPath);
    const { data } = await admin.storage.from("inputs").list(folder, { search: name, limit: 1 });
    if (!data?.some((f) => f.name === name)) {
      throw new GenerationRequestError("The attached image is missing. Please attach it again.", 400);
    }
  }

  const { data, error } = await admin.rpc("create_generations", {
    p_user_id: input.userId,
    p_count: input.count,
    p_kind: input.kind,
    p_mode: input.mode,
    p_model: input.model,
    p_prompt: input.prompt,
    p_final_prompt: input.prompt,
    p_preset_id: null,
    p_params: input.params,
    p_input_paths: input.inputPath ? [input.inputPath] : [],
    p_cost_each: input.costEach,
    p_parent_id: input.parentId ?? null,
  });

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new GenerationRequestError("You don't have enough credits for this.", 402);
    }
    if (error.message.includes("rate_limited")) {
      throw new GenerationRequestError("You're creating too fast. Please wait a moment and try again.", 429);
    }
    throw error;
  }
  return data as Generation[];
}

export function createImageJobs(input: {
  userId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  count: number;
  referencePath?: string;
  parentId?: string;
}) {
  return createJobs({
    userId: input.userId,
    kind: "image",
    mode: input.referencePath ? "edit" : "text",
    model: MODELS.image,
    prompt: input.prompt,
    params: { aspectRatio: input.aspectRatio },
    inputPath: input.referencePath,
    costEach: CREDIT_COSTS.image,
    count: input.count,
    parentId: input.parentId,
  });
}

export function createVideoJob(input: {
  userId: string;
  prompt: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: VideoDuration;
  startFramePath?: string;
  parentId?: string;
}) {
  return createJobs({
    userId: input.userId,
    kind: "video",
    mode: input.startFramePath ? "image_to_video" : "text",
    model: MODELS.video,
    prompt: input.prompt,
    params: { aspectRatio: input.aspectRatio, durationSeconds: input.durationSeconds },
    inputPath: input.startFramePath,
    costEach: videoCost(input.durationSeconds),
    count: 1,
    parentId: input.parentId,
  }).then(([job]) => job);
}

export function createVoiceJob(input: {
  userId: string;
  prompt: string;
  voice: VoiceId;
  style: VoiceStyleId;
  parentId?: string;
}) {
  return createJobs({
    userId: input.userId,
    kind: "voice",
    mode: "tts",
    model: MODELS.voice,
    prompt: input.prompt,
    params: { voice: input.voice, style: input.style, characters: input.prompt.length },
    costEach: voiceCost(input.prompt.length),
    count: 1,
    parentId: input.parentId,
  }).then(([job]) => job);
}

/** Moves a queued job to running. Returns the job, or null if someone else already claimed it. */
async function claim(id: string) {
  const { data } = await createAdminClient()
    .from("generations")
    .update({ status: "running" })
    .eq("id", id)
    .eq("status", "queued")
    .select(GENERATION_COLUMNS)
    .single<Generation>();
  return data;
}

async function readInput(path: string) {
  const { data: file, error } = await createAdminClient().storage.from("inputs").download(path);
  if (error || !file) throw new ProviderError("The attached image couldn't be read. Your credits were refunded.");
  return { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "image/png" };
}

async function succeed(job: Generation, file: { data: Buffer; mimeType: string }, ext: string) {
  const admin = createAdminClient();
  const path = `${job.user_id}/${job.id}.${ext}`;
  const { error } = await admin.storage.from("outputs").upload(path, file.data, { contentType: file.mimeType, upsert: true });
  if (error) throw error;
  await admin
    .from("generations")
    .update({ status: "succeeded", output_paths: [path] })
    .eq("id", job.id)
    // If the sweeper already failed and refunded it, leave it failed.
    .eq("status", "running");
}

async function fail(id: string, error: unknown) {
  console.error(`[generation ${id}] failed:`, error);
  const message = error instanceof ProviderError ? error.userMessage : "Something went wrong. Your credits were refunded.";
  await createAdminClient().rpc("fail_generation", { p_generation_id: id, p_error: message });
}

/** Runs one queued image job to completion. Never throws: failures are recorded and refunded. */
export async function runImageJob(id: string) {
  const job = await claim(id);
  if (!job) return;
  try {
    const reference = job.input_paths[0] ? await readInput(job.input_paths[0]) : undefined;
    const image = await generateImage({ prompt: job.final_prompt, aspectRatio: job.params.aspectRatio ?? "1:1", reference });
    await succeed(job, image, "jpg");
  } catch (error) {
    await fail(job.id, error);
  }
}

/** Runs one queued voiceover job to completion. Never throws: failures are recorded and refunded. */
export async function runVoiceJob(id: string) {
  const job = await claim(id);
  if (!job) return;
  try {
    const style = VOICE_STYLES.find((s) => s.id === job.params.style) ?? VOICE_STYLES[0];
    const audio = await synthesizeSpeech({
      text: job.final_prompt,
      voice: String(job.params.voice ?? "marin"),
      instructions: style.instructions,
    });
    await succeed(job, audio, "mp3");
  } catch (error) {
    await fail(job.id, error);
  }
}

// Finalising downloads the whole MP4, so don't let overlapping polls do it twice in one instance.
const finalising = new Set<string>();

/**
 * Checks a running video job once and saves the video if it's ready.
 * Returns true when the job has finished (succeeded or failed).
 */
export async function advanceVideoJob(job: Generation): Promise<boolean> {
  if (job.status !== "running" || !job.provider_op_id || finalising.has(job.id)) return false;
  finalising.add(job.id);
  try {
    const status = await checkVideo(job.provider_op_id);
    if (!status.done) return false;
    await succeed(job, status.video, "mp4");
    return true;
  } catch (error) {
    await fail(job.id, error);
    return true;
  } finally {
    finalising.delete(job.id);
  }
}

const POLL_INTERVAL_MS = 8_000;

/**
 * Starts a queued video job, then keeps checking on it until it finishes or `deadline` passes.
 * If time runs out, the studio's polling (GET /api/generations/:id) picks it up from there.
 */
export async function runVideoJob(id: string, deadline: number) {
  const job = await claim(id);
  if (!job) return;

  try {
    const frame = job.input_paths[0] ? await readInput(job.input_paths[0]) : undefined;
    const operationName = await startVideo({
      prompt: job.final_prompt,
      aspectRatio: job.params.aspectRatio ?? "16:9",
      durationSeconds: Number(job.params.durationSeconds ?? 8),
      startFrame: frame,
    });
    job.provider_op_id = operationName;
    await createAdminClient().from("generations").update({ provider_op_id: operationName }).eq("id", job.id);
  } catch (error) {
    await fail(job.id, error);
    return;
  }

  while (Date.now() + POLL_INTERVAL_MS < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (await advanceVideoJob(job)) return;
  }
}

function splitPath(path: string) {
  const i = path.lastIndexOf("/");
  return [path.slice(0, i), path.slice(i + 1)] as const;
}
