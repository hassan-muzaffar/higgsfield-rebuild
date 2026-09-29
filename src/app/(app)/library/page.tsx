import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/library/library-view";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { fetchLibraryPage, parseLibraryFilter } from "@/lib/generations/library";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage(props: PageProps<"/library">) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/library");

  const filter = parseLibraryFilter((await props.searchParams).type);
  const supabase = await createClient();

  let firstPage: Awaited<ReturnType<typeof fetchLibraryPage>> | null = null;
  let loadError = false;
  try {
    firstPage = await fetchLibraryPage(supabase, filter, 0);
  } catch (error) {
    console.error("[library] failed to load:", error);
    loadError = true;
  }
  const { data: favorites } = await supabase.from("favorites").select("generation_id");

  return (
    <LibraryView
      // Switching filters starts a fresh list.
      key={filter}
      userId={profile.id}
      filter={filter}
      initialItems={firstPage ?? []}
      initialFavoriteIds={(favorites ?? []).map((f) => f.generation_id)}
      loadError={loadError}
    />
  );
}
