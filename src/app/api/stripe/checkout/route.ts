import { NextResponse } from "next/server";
import { z } from "zod";
import { CREDIT_PACK_IDS, findPack } from "@/lib/billing/packs";
import { createCheckoutSession } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

const checkoutRequest = z.object({ pack: z.enum(CREDIT_PACK_IDS) });

/** Starts a Stripe Checkout for a credit pack and returns its URL. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = checkoutRequest.safeParse(await request.json().catch(() => null));
  const pack = parsed.success ? findPack(parsed.data.pack) : undefined;
  if (!pack) return NextResponse.json({ error: "Pick a credit pack." }, { status: 400 });

  try {
    const url = await createCheckoutSession({
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      pack,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[checkout] failed:", error);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
