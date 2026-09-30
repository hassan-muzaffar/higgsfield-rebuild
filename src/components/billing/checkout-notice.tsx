"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export type CheckoutOutcome = "success" | "pending" | "canceled" | "error";

/** Shows the result of returning from Stripe Checkout once, then tidies the URL so a reload doesn't repeat it. */
export function CheckoutNotice({ outcome, credits }: { outcome: CheckoutOutcome; credits?: number }) {
  useEffect(() => {
    if (outcome === "success") toast.success(credits ? `Payment complete: ${credits} credits added.` : "Payment complete.");
    if (outcome === "pending") toast.info("Payment is processing. Your credits will appear as soon as it clears.");
    if (outcome === "canceled") toast("Checkout cancelled. You haven't been charged.");
    if (outcome === "error") toast.error("We couldn't confirm that payment. If you were charged, it will appear shortly.");
    window.history.replaceState(null, "", "/billing");
  }, [outcome, credits]);
  return null;
}
