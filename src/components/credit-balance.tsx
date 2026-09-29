"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CoinsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCredits, useCredits } from "@/lib/credits-store";
import { subscribeAsUser } from "@/lib/supabase/realtime";

type Props = { userId: string; initial: number };

export function CreditBalance({ userId, initial }: Props) {
  const credits = useCredits(initial);

  useEffect(() => {
    setCredits(initial);
  }, [initial]);

  // Live updates for spending, refunds and purchases, from any tab.
  useEffect(() => {
    return subscribeAsUser(`credits:${userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => setCredits((payload.new as { credits: number }).credits),
      ),
    );
  }, [userId]);

  return (
    <Button asChild variant="secondary" size="sm" className="gap-1.5 tabular-nums">
      <Link href="/billing" aria-label={`${credits} credits. Buy more`}>
        <CoinsIcon className="text-primary" aria-hidden="true" />
        {credits}
      </Link>
    </Button>
  );
}
