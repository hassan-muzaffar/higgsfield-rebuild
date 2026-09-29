import { NextResponse } from "next/server";
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
