import type { Metadata } from "next";
import { CompassIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8">
      <EmptyState
        icon={CompassIcon}
        title="Nothing shared yet"
        description="Creations people share from their library will show up here."
      />
    </div>
  );
}
