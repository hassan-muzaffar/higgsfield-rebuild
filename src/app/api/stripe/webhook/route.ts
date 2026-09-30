import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfillCheckoutSession, stripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. Verifies the signature, ignores events it has already processed,
 * and adds credits for completed checkouts.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  // The signature covers the exact raw body, so read it as text before parsing.
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: seenError } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (seenError) {
    // Unique violation: Stripe re-sent an event we already handled.
    if (seenError.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    console.error("[stripe webhook] couldn't record event:", seenError);
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await fulfillCheckoutSession(event.data.object);
      return NextResponse.json({ received: true, result });
    }
    return NextResponse.json({ received: true, ignored: event.type });
  } catch (error) {
    // Forget the event so Stripe's retry can process it again.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error(`[stripe webhook] ${event.type} failed:`, error);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
