import { after, NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMAGE_ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  type ImageAspectRatio,
  type VideoAspectRatio,
  type VideoDuration,
  VOICE_IDS,
  VOICE_STYLE_IDS,
  type VoiceId,
  type VoiceStyleId,
} from "@/lib/generations/config";
import {
  createImageJobs,
  createVideoJob,
  createVoiceJob,
  GenerationRequestError,
  runImageJob,
  runVideoJob,
  runVoiceJob,
} from "@/lib/generations/server";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export const maxDuration = 300;

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Re-runs a failed generation as a new job (charged again; the failed one was refunded) and removes the failed one. */
export async function POST(_request: Request, ctx: RouteContext<"/api/generations/[id]/retry">) {
  const startedAt = Date.now();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: failed } = await supabase
    .from("generations")
    .select(GENERATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<Generation>();

  if (!failed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (failed.status !== "failed") {
    return NextResponse.json({ error: "Only failed generations can be retried." }, { status: 409 });
  }

  try {
    const common = {
      userId,
      prompt: failed.prompt,
      parentId: failed.parent_id ?? undefined,
    };
    let job: Generation;
    if (failed.kind === "image") {
      [job] = await createImageJobs({
        ...common,
        aspectRatio: pick<ImageAspectRatio>(failed.params.aspectRatio, IMAGE_ASPECT_RATIOS, "1:1"),
        count: 1,
        referencePath: failed.input_paths[0],
        presetId: failed.preset_id ?? undefined,
      });
    } else if (failed.kind === "voice") {
      job = await createVoiceJob({
        ...common,
        voice: pick<VoiceId>(failed.params.voice, VOICE_IDS, "marin"),
        style: pick<VoiceStyleId>(failed.params.style, VOICE_STYLE_IDS, "natural"),
      });
    } else {
      job = await createVideoJob({
        ...common,
        aspectRatio: pick<VideoAspectRatio>(failed.params.aspectRatio, VIDEO_ASPECT_RATIOS, "16:9"),
        durationSeconds: pick<VideoDuration>(failed.params.durationSeconds, VIDEO_DURATIONS, 8),
        startFramePath: failed.input_paths[0],
        presetId: failed.preset_id ?? undefined,
      });
    }

    await createAdminClient().from("generations").delete().eq("id", failed.id);
    after(() =>
      job.kind === "video"
        ? runVideoJob(job.id, startedAt + (maxDuration - 20) * 1000)
        : job.kind === "voice"
          ? runVoiceJob(job.id)
          : runImageJob(job.id),
    );
    return NextResponse.json({ generation: job, replaced: failed.id }, { status: 202 });
  } catch (error) {
    if (error instanceof GenerationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[retry] failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
