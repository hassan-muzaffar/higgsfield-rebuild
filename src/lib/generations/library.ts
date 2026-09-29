import type { SupabaseClient } from "@supabase/supabase-js";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export const LIBRARY_FILTERS = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "voice", label: "Voice" },
  { id: "favorites", label: "Favourites" },
] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number]["id"];

export const LIBRARY_PAGE_SIZE = 30;

export function parseLibraryFilter(value: unknown): LibraryFilter {
  return LIBRARY_FILTERS.some((f) => f.id === value) ? (value as LibraryFilter) : "all";
}

/**
 * One page of the signed-in user's finished generations, newest first. Works with both the
 * server and the browser client; RLS limits it to the user's own rows.
 */
export async function fetchLibraryPage(supabase: SupabaseClient, filter: LibraryFilter, offset: number) {
  // An inner join keeps only favourited rows; RLS on favorites keeps it to the user's own.
  const columns = filter === "favorites" ? `${GENERATION_COLUMNS}, favorites!inner(generation_id)` : GENERATION_COLUMNS;
  let query = supabase
    .from("generations")
    .select(columns)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .range(offset, offset + LIBRARY_PAGE_SIZE - 1);
  if (filter === "image" || filter === "video" || filter === "voice") query = query.eq("kind", filter);

  const { data, error } = await query.returns<Generation[]>();
  if (error) throw error;
  return data;
}
