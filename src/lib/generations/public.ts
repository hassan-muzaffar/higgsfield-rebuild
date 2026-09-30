import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationKind } from "@/lib/generations/types";

/** A shared generation as anyone may see it (from the public_generations view: no owner id, cost or inputs). */
export type PublicGeneration = {
  id: string;
  kind: GenerationKind;
  prompt: string;
  preset_id: string | null;
  params: { aspectRatio?: string; durationSeconds?: number; voice?: string; style?: string };
  output_paths: string[];
  share_slug: string;
  created_at: string;
  creator_name: string | null;
  creator_avatar_url: string | null;
  mediaUrl?: string;
};

const COLUMNS = "id, kind, prompt, preset_id, params, output_paths, share_slug, created_at, creator_name, creator_avatar_url";
export const EXPLORE_PAGE_SIZE = 24;
export const EXPLORE_FILTERS = ["all", "image", "video", "voice"] as const;
export type ExploreFilter = (typeof EXPLORE_FILTERS)[number];

/** Signs media URLs for public items. Only ever called with rows from the public view. */
async function withMedia(rows: PublicGeneration[], expiresIn = 60 * 60 * 6) {
  const paths = rows.map((r) => r.output_paths[0]).filter(Boolean);
  if (!paths.length) return rows;
  const { data } = await createAdminClient().storage.from("outputs").createSignedUrls(paths, expiresIn);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, mediaUrl: urls.get(r.output_paths[0]) ?? undefined }));
}

/** One shared generation by its link slug, or null if it doesn't exist or isn't public. */
export async function getPublicGeneration(slug: string, expiresIn?: number) {
  if (!/^[A-Za-z0-9]{6,20}$/.test(slug)) return null;
  const { data } = await createAdminClient()
    .from("public_generations")
    .select(COLUMNS)
    .eq("share_slug", slug)
    .maybeSingle<PublicGeneration>();
  if (!data) return null;
  const [row] = await withMedia([data], expiresIn);
  return row;
}

/** A page of the public feed, newest first. */
export async function getExplorePage(filter: ExploreFilter, offset: number) {
  let query = createAdminClient()
    .from("public_generations")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .range(offset, offset + EXPLORE_PAGE_SIZE - 1);
  if (filter !== "all") query = query.eq("kind", filter);
  const { data, error } = await query.returns<PublicGeneration[]>();
  if (error) throw error;
  return withMedia(data);
}
