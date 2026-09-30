import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUserId } from "@/lib/supabase/server";

const shareRequest = z.object({ public: z.boolean() });

// URL-safe, unambiguous, 10 characters: ~50 bits, so links can't be guessed.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function newSlug() {
  return Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Makes a finished generation public (with a share link) or private again. */
export async function POST(request: Request, ctx: RouteContext<"/api/generations/[id]/share">) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = shareRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { id } = await ctx.params;
  // Read through RLS: only the owner gets past this point.
  const { data: generation } = await (await createClient())
    .from("generations")
    .select("id, status, share_slug")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; share_slug: string | null }>();
  if (!generation) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (generation.status !== "succeeded") {
    return NextResponse.json({ error: "Only finished creations can be shared." }, { status: 409 });
  }

  // Keep the same slug when re-sharing, so an old link works again.
  const slug = generation.share_slug ?? newSlug();
  const { data, error } = await createAdminClient()
    .from("generations")
    .update({ is_public: parsed.data.public, share_slug: slug })
    .eq("id", id)
    .select("is_public, share_slug")
    .single();
  if (error) {
    console.error(`[share ${id}] failed:`, error);
    return NextResponse.json({ error: "Couldn't update sharing. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ isPublic: data.is_public, slug: data.share_slug, path: `/g/${data.share_slug}` });
}
