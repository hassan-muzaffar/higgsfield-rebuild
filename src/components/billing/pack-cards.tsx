"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, CoinsIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS, formatPrice, type CreditPackId } from "@/lib/billing/packs";
import { cn } from "@/lib/utils";

/** The three credit packs. Signed in: Buy opens Stripe Checkout. Signed out: Buy goes to sign-in first. */
export function PackCards({ signedIn }: { signedIn: boolean }) {
  const [pending, setPending] = useState<CreditPackId | null>(null);

  async function buy(pack: CreditPackId) {
    setPending(pack);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't start checkout. Please try again.");
      window.location.assign(body.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start checkout.");
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CREDIT_PACKS.map((pack) => {
        const popular = "popular" in pack && pack.popular;
        const perHundred = formatPrice(Math.round((pack.priceCents / pack.credits) * 100));
        return (
          <div
            key={pack.id}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-6",
              popular && "border-primary/60 shadow-[0_0_0_1px] shadow-primary/40",
            )}
          >
            {popular && <Badge className="absolute -top-2.5 left-6">Most popular</Badge>}
            <h3 className="font-semibold">{pack.name}</h3>
            <p className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">{formatPrice(pack.priceCents)}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <CoinsIcon className="size-4 text-primary" aria-hidden="true" />
              <span className="font-medium tabular-nums">{pack.credits.toLocaleString()} credits</span>
              <span className="text-muted-foreground">· {perHundred} per 100</span>
            </p>
            <p className="mt-3 flex-1 text-sm text-muted-foreground">{pack.blurb}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {["Images, video and voice", "Credits never expire", "Failed generations refunded"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {signedIn ? (
              <Button
                className="mt-6"
                variant={popular ? "default" : "secondary"}
                disabled={pending !== null}
                onClick={() => buy(pack.id)}
              >
                {pending === pack.id && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                Buy {pack.name}
              </Button>
            ) : (
              <Button asChild className="mt-6" variant={popular ? "default" : "secondary"}>
                <Link href="/login?next=/billing">Get started</Link>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
