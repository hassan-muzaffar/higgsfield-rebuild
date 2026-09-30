import "server-only";
import Stripe from "stripe";
import { findPack, type CreditPack } from "@/lib/billing/packs";
import { createAdminClient } from "@/lib/supabase/admin";

let client: Stripe | null = null;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

function appUrl(origin?: string) {
  return process.env.NEXT_PUBLIC_APP_URL ?? origin ?? "http://localhost:3000";
}

/** Reuses the user's Stripe customer, creating one on their first purchase. */
async function customerFor(userId: string, email: string | undefined) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", userId).single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

  const customer = await stripe().customers.create({ email, metadata: { user_id: userId } });
  // Only set it if still empty, in case two checkouts started at once.
  const { data: updated } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();
  if (updated) return customer.id;
  const { data: again } = await admin.from("profiles").select("stripe_customer_id").eq("id", userId).single();
  return (again?.stripe_customer_id as string | null) ?? customer.id;
}

/** Creates a hosted Checkout page for a credit pack. */
export async function createCheckoutSession(input: { userId: string; email?: string; pack: CreditPack; origin?: string }) {
  const base = appUrl(input.origin);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: await customerFor(input.userId, input.email),
    client_reference_id: input.userId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.pack.priceCents,
          product_data: {
            name: `OneShot ${input.pack.name}: ${input.pack.credits} credits`,
            description: input.pack.blurb,
          },
        },
      },
    ],
    metadata: { user_id: input.userId, pack: input.pack.id, credits: String(input.pack.credits) },
    success_url: `${base}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing?canceled=1`,
  });
  if (!session.url) throw new Error("Checkout session has no URL");
  return session.url;
}

export type FulfillResult = "fulfilled" | "already" | "unpaid" | "invalid";

/**
 * Adds the credits for a completed Checkout session, exactly once. Safe to call from both
 * the webhook and the billing page. Trusts only Stripe's own record of the session.
 */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfillResult> {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  const pack = findPack(session.metadata?.pack);
  if (!userId || !pack || session.mode !== "payment") return "invalid";
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return "unpaid";

  const { data, error } = await createAdminClient().rpc("fulfill_purchase", {
    p_user_id: userId,
    p_stripe_session_id: session.id,
    p_pack: pack.id,
    p_credits: pack.credits,
    p_amount_cents: session.amount_total ?? pack.priceCents,
  });
  if (error) throw error;
  return data ? "fulfilled" : "already";
}
