"use client";

import { createClient } from "@/lib/supabase/client";
import type { Generation } from "@/lib/generations/types";

/** Starts a browser download of a generation's file. Throws with a user-facing message on failure. */
export async function downloadGeneration(g: Generation) {
  const path = g.output_paths[0];
  if (!path) throw new Error("There's nothing to download yet.");
  const { data, error } = await createClient()
    .storage.from("outputs")
    .createSignedUrl(path, 60, { download: `oneshot-${g.id.slice(0, 8)}.${path.split(".").pop()}` });
  if (error || !data) throw new Error("Couldn't start the download. Please try again.");
  window.location.assign(data.signedUrl);
}

/** Deletes a generation and its files. Throws with a user-facing message on failure. */
export async function deleteGeneration(id: string) {
  const res = await fetch(`/api/generations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't delete it. Please try again.");
  }
}

/** Adds or removes a favourite (RLS only allows the user's own generations). */
export async function setFavorite(userId: string, generationId: string, favorite: boolean) {
  const supabase = createClient();
  const { error } = favorite
    ? await supabase.from("favorites").upsert({ user_id: userId, generation_id: generationId })
    : await supabase.from("favorites").delete().eq("user_id", userId).eq("generation_id", generationId);
  if (error) throw new Error("Couldn't update favourites. Please try again.");
}
