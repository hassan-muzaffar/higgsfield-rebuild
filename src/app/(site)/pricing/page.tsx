import type { Metadata } from "next";
import { PackCards } from "@/components/billing/pack-cards";
import { CREDIT_COSTS } from "@/lib/generations/config";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple credit packs for images, video and voice. Credits never expire.",
};

const COSTS = [
  { what: "Image (generate or edit)", cost: `${CREDIT_COSTS.image} credits` },
  { what: "Video clip", cost: `${CREDIT_COSTS.videoPerSecond} credits per second (4s = 16, 8s = 32)` },
  { what: "Voiceover", cost: `${CREDIT_COSTS.voicePer1000Characters} credits per 1,000 characters` },
  { what: "Prompt enhance and voice dictation", cost: "Free" },
];

export default async function PricingPage() {
  const signedIn = Boolean(await getProfile());

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">Pay for what you create</h1>
        <p className="mt-3 text-muted-foreground">
          Start with 50 free credits. Top up with a pack whenever you need more. No subscription, and credits never
          expire.
        </p>
      </div>

      <section aria-labelledby="packs-heading" className="mt-12">
        <h2 id="packs-heading" className="sr-only">Credit packs</h2>
        <PackCards signedIn={signedIn} />
      </section>

      <section aria-labelledby="costs-heading" className="mx-auto mt-16 max-w-2xl">
        <h2 id="costs-heading" className="text-lg font-semibold">What things cost</h2>
        <dl className="mt-4 divide-y rounded-xl border">
          {COSTS.map((row) => (
            <div key={row.what} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:justify-between">
              <dt>{row.what}</dt>
              <dd className="text-muted-foreground">{row.cost}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          The cost is shown on the Generate button before you create anything, and failed generations are refunded
          automatically.
        </p>
      </section>
    </div>
  );
}
