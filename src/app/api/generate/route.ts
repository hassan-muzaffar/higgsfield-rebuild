import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/supabase/server";
import { IMAGE_ASPECT_RATIOS, MAX_IMAGES_PER_REQUEST, MAX_PROMPT_LENGTH } from "@/lib/generations/config";
import { createImageJobs, GenerationRequestError, runImageJob } from "@/lib/generations/server";

// Image jobs run in `after()`, which lives as long as this route's max duration.
export const maxDuration = 60;

const imageRequest = z.object({
  kind: z.literal("image"),
  prompt: z.string().trim().min(1, "Write a prompt first.").max(MAX_PROMPT_LENGTH),
  aspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
  count: z.number().int().min(1).max(MAX_IMAGES_PER_REQUEST),
  referencePath: z.string().max(300).optional(),
  parentId: z.uuid().optional(),
});

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = imageRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const jobs = await createImageJobs({ userId, ...parsed.data });
    after(() => Promise.all(jobs.map((job) => runImageJob(job.id))));
    return NextResponse.json({ generations: jobs }, { status: 202 });
  } catch (error) {
    if (error instanceof GenerationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[generate] failed to create jobs:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
