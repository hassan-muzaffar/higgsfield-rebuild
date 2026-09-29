import { after, NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_ASPECT_RATIOS, type ImageAspectRatio } from "@/lib/generations/config";
import { createImageJobs, GenerationRequestError, runImageJob } from "@/lib/generations/server";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export const maxDuration = 60;

/** Re-runs a failed generation as a new job (charged again; the failed one was refunded) and removes the failed one. */
export async function POST(_request: Request, ctx: RouteContext<"/api/generations/[id]/retry">) {
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
  if (failed.status !== "failed" || failed.kind !== "image") {
    return NextResponse.json({ error: "Only failed images can be retried." }, { status: 409 });
  }

  const aspectRatio = IMAGE_ASPECT_RATIOS.includes(failed.params.aspectRatio as ImageAspectRatio)
    ? (failed.params.aspectRatio as ImageAspectRatio)
    : "1:1";

  try {
    const [job] = await createImageJobs({
      userId,
      prompt: failed.prompt,
      aspectRatio,
      count: 1,
      referencePath: failed.input_paths[0],
      parentId: failed.parent_id ?? undefined,
    });
    await createAdminClient().from("generations").delete().eq("id", failed.id);
    after(() => runImageJob(job.id));
    return NextResponse.json({ generation: job, replaced: failed.id }, { status: 202 });
  } catch (error) {
    if (error instanceof GenerationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[retry] failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
