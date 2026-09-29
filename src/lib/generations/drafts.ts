import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMAGE_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VOICE_IDS,
  VOICE_STYLE_IDS,
  type ImageAspectRatio,
  type VideoAspectRatio,
  type VideoDuration,
  type VoiceId,
  type VoiceStyleId,
} from "@/lib/generations/config";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";
import type { Draft } from "@/lib/generations/draft-types";

export const DRAFT_ACTIONS = ["reuse", "animate", "edit", "voiceover"] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Copies a finished image into the user's inputs, so it can be edited or animated without touching the original. */
async function copyOutputToInputs(userId: string, outputPath: string) {
  const admin = createAdminClient();
  const ext = outputPath.split(".").pop() ?? "jpg";
  const inputPath = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("outputs").copy(outputPath, inputPath, { destinationBucket: "inputs" });
  if (error) throw error;
  return inputPath;
}

async function signInput(path: string) {
  const { data } = await createAdminClient().storage.from("inputs").createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

/**
 * Prepares the prompt bar for "Reuse", "Animate this", "Edit this" or "Add voiceover".
 * Returns null if the source isn't the user's or can't be used for that action.
 */
export async function prepareDraft(action: DraftAction, sourceId: string, userId: string): Promise<Draft | null> {
  const admin = createAdminClient();
  const { data: source } = await admin
    .from("generations")
    .select(GENERATION_COLUMNS)
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle<Generation>();
  if (!source) return null;

  const nonce = `${action}:${sourceId}:${Date.now()}`;
  const aspectRatio = source.params.aspectRatio;

  if (action === "voiceover") {
    return { nonce, mode: "voice", prompt: source.prompt, parentId: source.id };
  }

  if (action === "animate" || action === "edit") {
    if (source.kind !== "image" || source.status !== "succeeded" || !source.output_paths[0]) return null;
    const path = await copyOutputToInputs(userId, source.output_paths[0]);
    const reference = { path, previewUrl: (await signInput(path)) ?? "" };
    if (action === "animate") {
      // Veo only does landscape or portrait: pick the closer one.
      const [w, h] = (aspectRatio ?? "16:9").split(":").map(Number);
      const videoRatio: VideoAspectRatio = h > w ? "9:16" : "16:9";
      return { nonce, mode: "video", prompt: "", parentId: source.id, reference, video: { aspectRatio: videoRatio } };
    }
    return {
      nonce,
      mode: "image",
      prompt: "",
      parentId: source.id,
      reference,
      image: { aspectRatio: pick<ImageAspectRatio>(aspectRatio, IMAGE_ASPECT_RATIOS, "1:1") },
    };
  }

  // Reuse: same kind, prompt and settings, including the original attached image if it still exists.
  let reference: Draft["reference"];
  if (source.input_paths[0]) {
    const previewUrl = await signInput(source.input_paths[0]);
    if (previewUrl) reference = { path: source.input_paths[0], previewUrl };
  }
  switch (source.kind) {
    case "image":
      return {
        nonce,
        mode: "image",
        prompt: source.prompt,
        reference,
        presetId: source.preset_id ?? undefined,
        image: { aspectRatio: pick<ImageAspectRatio>(aspectRatio, IMAGE_ASPECT_RATIOS, "1:1") },
      };
    case "video":
      return {
        nonce,
        mode: "video",
        prompt: source.prompt,
        reference,
        presetId: source.preset_id ?? undefined,
        video: {
          aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
          durationSeconds: pick<VideoDuration>(source.params.durationSeconds, VIDEO_DURATIONS, 8),
        },
      };
    case "voice":
      return {
        nonce,
        mode: "voice",
        prompt: source.prompt,
        voice: {
          voice: pick<VoiceId>(source.params.voice, VOICE_IDS, "marin"),
          style: pick<VoiceStyleId>(source.params.style, VOICE_STYLE_IDS, "natural"),
        },
      };
  }
}
