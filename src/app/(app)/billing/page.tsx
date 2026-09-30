import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoinsIcon, ReceiptIcon } from "lucide-react";
import { CheckoutNotice, type CheckoutOutcome } from "@/components/billing/checkout-notice";
import { PackCards } from "@/components/billing/pack-cards";
import { findPack, formatPrice } from "@/lib/billing/packs";
import { fulfillCheckoutSession, stripe } from "@/lib/billing/stripe";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { CREDIT_COSTS } from "@/lib/generations/config";

export const metadata: Metadata = { title: "Billing" };

type LedgerRow = { id: number; delta: number; reason: "signup" | "generation" | "refund" | "purchase"; ref_id: string | null; created_at: string };
type PurchaseRow = { id: string; pack: string; credits: number; amount_cents: number; created_at: string };

/** Confirms a Checkout session on return from Stripe, adding credits if the webhook hasn't yet. */
async function confirmCheckout(sessionId: string, userId: string): Promise<{ outcome: CheckoutOutcome; credits?: number }> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    // Only the buyer can confirm their own session.
    if ((session.metadata?.user_id ?? session.client_reference_id) !== userId) return { outcome: "error" };
    const result = await fulfillCheckoutSession(session);
    if (result === "fulfilled" || result === "already") {
      return { outcome: "success", credits: findPack(session.metadata?.pack)?.credits };
    }
    return { outcome: result === "unpaid" ? "pending" : "error" };
  } catch (error) {
    console.error("[billing] couldn't confirm checkout:", error);
    return { outcome: "error" };
  }
}

export default async function BillingPage(props: PageProps<"/billing">) {
  const initialProfile = await getProfile();
  if (!initialProfile) redirect("/login?next=/billing");

  const searchParams = await props.searchParams;
  let notice: { outcome: CheckoutOutcome; credits?: number } | null = null;
  if (typeof searchParams.session_id === "string") notice = await confirmCheckout(searchParams.session_id, initialProfile.id);
  else if (searchParams.canceled) notice = { outcome: "canceled" };

  const supabase = await createClient();
  const [{ data: profile }, { data: purchases }, { data: ledger }] = await Promise.all([
    // Re-read the balance: confirming a checkout may just have changed it.
    supabase.from("profiles").select("credits").eq("id", initialProfile.id).single(),
    supabase.from("purchases").select("id, pack, credits, amount_cents, created_at").order("created_at", { ascending: false }).limit(20).returns<PurchaseRow[]>(),
    supabase.from("credit_ledger").select("id, delta, reason, ref_id, created_at").order("created_at", { ascending: false }).limit(40).returns<LedgerRow[]>(),
  ]);

  // Label generation charges and refunds with what was made.
  const generationIds = [...new Set((ledger ?? []).filter((l) => l.reason === "generation" || l.reason === "refund").map((l) => l.ref_id!))];
  const { data: generations } = generationIds.length
    ? await supabase.from("generations").select("id, kind, params").in("id", generationIds)
    : { data: [] as { id: string; kind: string; params: { durationSeconds?: number } }[] };
  const describe = new Map(
    (generations ?? []).map((g) => [g.id, g.kind === "video" ? `Video (${g.params?.durationSeconds ?? 8}s)` : g.kind === "voice" ? "Voiceover" : "Image"]),
  );

  function ledgerLabel(row: LedgerRow) {
    if (row.reason === "signup") return "Welcome credits";
    if (row.reason === "purchase") return "Credit purchase";
    const what = (row.ref_id && describe.get(row.ref_id)) ?? "Generation (deleted)";
    return row.reason === "refund" ? `Refund: ${what}` : what;
  }

  const credits = profile?.credits ?? initialProfile.credits;
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-10">
      {notice && <CheckoutNotice outcome={notice.outcome} credits={notice.credits} />}

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-sm text-muted-foreground">Your balance</h1>
          <p className="mt-1 flex items-center gap-2 text-4xl font-semibold tracking-tight tabular-nums">
            <CoinsIcon className="size-7 text-primary" aria-hidden="true" />
            {credits.toLocaleString()} <span className="text-lg font-normal text-muted-foreground">credits</span>
          </p>
        </div>
        <ul className="grid gap-1 text-sm text-muted-foreground sm:text-right">
          <li>Image: {CREDIT_COSTS.image} credits</li>
          <li>Video: {CREDIT_COSTS.videoPerSecond} credits per second</li>
          <li>Voiceover: {CREDIT_COSTS.voicePer1000Characters} credits per 1,000 characters</li>
        </ul>
      </section>

      <section aria-labelledby="buy-heading">
        <h2 id="buy-heading" className="mb-4 text-lg font-semibold">Buy credits</h2>
        <PackCards signedIn />
        <p className="mt-3 text-xs text-muted-foreground">
          Payments are handled securely by Stripe. This is a demo in test mode: use card 4242 4242 4242 4242, any future
          date and any CVC.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="purchases-heading">
          <h2 id="purchases-heading" className="mb-3 text-lg font-semibold">Purchases</h2>
          {purchases?.length ? (
            <ul className="divide-y rounded-xl border">
              {purchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                  <div>
                    <p className="font-medium">{findPack(p.pack)?.name ?? p.pack} · {p.credits.toLocaleString()} credits</p>
                    <p className="text-xs text-muted-foreground">{dateFormat.format(new Date(p.created_at))}</p>
                  </div>
                  <span className="tabular-nums">{formatPrice(p.amount_cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              <ReceiptIcon className="mb-2 size-5" aria-hidden="true" />
              No purchases yet.
            </div>
          )}
        </section>

        <section aria-labelledby="usage-heading">
          <h2 id="usage-heading" className="mb-3 text-lg font-semibold">Credit history</h2>
          <ul className="divide-y rounded-xl border">
            {(ledger ?? []).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                <div>
                  <p>{ledgerLabel(row)}</p>
                  <p className="text-xs text-muted-foreground">{dateFormat.format(new Date(row.created_at))}</p>
                </div>
                <span className={row.delta > 0 ? "text-primary tabular-nums" : "text-muted-foreground tabular-nums"}>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
