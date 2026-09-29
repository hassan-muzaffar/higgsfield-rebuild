import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export const metadata: Metadata = { title: "Create" };

export default async function CreatePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/create");

  const supabase = await createClient();
  const { data } = await supabase
    .from("generations")
    .select(GENERATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<Generation[]>();

  return <Studio userId={profile.id} initialCredits={profile.credits} initialGenerations={data ?? []} />;
}
