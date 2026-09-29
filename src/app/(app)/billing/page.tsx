import type { Metadata } from "next";
import { CoinsIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const profile = await getProfile();

  return (
    <EmptyState
      icon={CoinsIcon}
      title={`${profile?.credits ?? 0} credits`}
      description="Credit packs and your purchase history will appear here."
    />
  );
}
