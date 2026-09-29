import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { DRAFT_ACTIONS, prepareDraft } from "@/lib/generations/drafts";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export const metadata: Metadata = { title: "Create" };

export default async function CreatePage(props: PageProps<"/create">) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/create");

  // "Reuse", "Animate this", "Edit this" and "Add voiceover" link here as ?<action>=<generation id>.
  const searchParams = await props.searchParams;
  const action = DRAFT_ACTIONS.find((a) => typeof searchParams[a] === "string");
  // If the draft can't be prepared (e.g. the copy fails), open the studio without it rather than erroring.
  const draft = action
    ? await prepareDraft(action, searchParams[action] as string, profile.id).catch((error) => {
        console.error(`[create] couldn't prepare "${action}" draft:`, error);
        return null;
      })
    : null;

  const supabase = await createClient();
  const [{ data: generations }, { data: favorites }] = await Promise.all([
    supabase
      .from("generations")
      .select(GENERATION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<Generation[]>(),
    supabase.from("favorites").select("generation_id"),
  ]);

  return (
    <Studio
      // A new draft re-initialises the prompt bar.
      key={draft?.nonce ?? "studio"}
      userId={profile.id}
      initialCredits={profile.credits}
      initialGenerations={generations ?? []}
      initialFavoriteIds={(favorites ?? []).map((f) => f.generation_id)}
      draft={draft ?? undefined}
    />
  );
}
