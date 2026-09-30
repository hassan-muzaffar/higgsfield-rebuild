import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SharedNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
        <LinkIcon className="size-5 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">This link isn&apos;t available</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been made private or deleted by its creator.</p>
      <Button asChild className="mt-6">
        <Link href="/explore">Explore what people are making</Link>
      </Button>
    </div>
  );
}
