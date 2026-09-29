import type { Metadata } from "next";
import Link from "next/link";
import { ImagesIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <EmptyState
      icon={ImagesIcon}
      title="Your library is empty"
      description="Everything you create (images, videos and voiceovers) will be saved here."
    >
      <Button asChild>
        <Link href="/create">Create something</Link>
      </Button>
    </EmptyState>
  );
}
