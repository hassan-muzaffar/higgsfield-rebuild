import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "Create" };

export default async function CreatePage() {
  const profile = await getProfile();
  const firstName = profile?.display_name?.split(" ")[0];

  return (
    <EmptyState
      icon={SparklesIcon}
      title={firstName ? `Welcome, ${firstName}` : "Welcome to OneShot"}
      description={`You have ${profile?.credits ?? 0} credits. The studio for images, video and voice opens here next.`}
    />
  );
}
