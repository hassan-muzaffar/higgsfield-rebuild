import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/supabase/server";
import {
  IMAGE_ASPECT_RATIOS,
  MAX_IMAGES_PER_REQUEST,
  MAX_PROMPT_LENGTH,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  MAX_VOICE_CHARACTERS,
  VOICE_IDS,
  VOICE_STYLE_IDS,
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

// Jobs run in `after()`, which lives as long as this route's max duration (the Vercel Hobby maximum).
export const maxDuration = 300;

const prompt = z.string().trim().min(1, "Write a prompt first.").max(MAX_PROMPT_LENGTH);
const inputPath = z.string().max(300).optional();

const generateRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    prompt,
    aspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
    count: z.number().int().min(1).max(MAX_IMAGES_PER_REQUEST),
    referencePath: inputPath,
    parentId: z.uuid().optional(),
  }),
  z.object({
    kind: z.literal("video"),
    prompt,
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
    durationSeconds: z.union(VIDEO_DURATIONS.map((d) => z.literal(d))),
    startFramePath: inputPath,
    parentId: z.uuid().optional(),
  }),
  z.object({
    kind: z.literal("voice"),
    prompt: z.string().trim().min(1, "Write the script first.").max(MAX_VOICE_CHARACTERS),
    voice: z.enum(VOICE_IDS),
    style: z.enum(VOICE_STYLE_IDS),
    parentId: z.uuid().optional(),
  }),
]);

export async function POST(request: Request) {
  const startedAt = Date.now();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = generateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const data = parsed.data;
    if (data.kind === "image") {
      const jobs = await createImageJobs({ userId, ...data });
      after(() => Promise.all(jobs.map((job) => runImageJob(job.id))));
      return NextResponse.json({ generations: jobs }, { status: 202 });
    }

    if (data.kind === "voice") {
      const job = await createVoiceJob({ userId, ...data });
      after(() => runVoiceJob(job.id));
      return NextResponse.json({ generations: [job] }, { status: 202 });
    }

    const job = await createVideoJob({ userId, ...data });
    // Leave a margin before the platform cuts the function off.
    after(() => runVideoJob(job.id, startedAt + (maxDuration - 20) * 1000));
    return NextResponse.json({ generations: [job] }, { status: 202 });
  } catch (error) {
    if (error instanceof GenerationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[generate] failed to create jobs:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
