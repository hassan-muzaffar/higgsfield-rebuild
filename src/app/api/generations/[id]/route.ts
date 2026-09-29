import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUserId } from "@/lib/supabase/server";
import { advanceVideoJob } from "@/lib/generations/server";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

// Finishing a video downloads and stores the MP4.
export const maxDuration = 60;

/** Returns a generation. For a running video, also checks the provider and saves the result if it's ready. */
export async function GET(_request: Request, ctx: RouteContext<"/api/generations/[id]">) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const load = () =>
    supabase.from("generations").select(GENERATION_COLUMNS).eq("id", id).maybeSingle<Generation>();

  let { data: generation } = await load();
  if (!generation) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (generation.kind === "video" && (await advanceVideoJob(generation))) {
    ({ data: generation } = await load());
  }
  return NextResponse.json({ generation });
}

/** Deletes one of the user's generations and its output files. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/generations/[id]">) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await ctx.params;
  // Read through RLS, so only the owner gets past this point.
  const supabase = await createClient();
  const { data: generation } = await supabase
    .from("generations")
    .select("id, status, output_paths")
    .eq("id", id)
    .maybeSingle<Pick<Generation, "id" | "status" | "output_paths">>();
  if (!generation) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (generation.status === "queued" || generation.status === "running") {
    return NextResponse.json({ error: "Wait for it to finish before deleting it." }, { status: 409 });
  }

  const admin = createAdminClient();
  if (generation.output_paths.length) {
    const { error } = await admin.storage.from("outputs").remove(generation.output_paths);
    if (error) {
      console.error(`[delete ${id}] removing files failed:`, error);
      return NextResponse.json({ error: "Couldn't delete the files. Please try again." }, { status: 500 });
    }
  }
  await admin.from("generations").delete().eq("id", id);
  return new NextResponse(null, { status: 204 });
}
