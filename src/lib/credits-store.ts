"use client";

import { useSyncExternalStore } from "react";

// One credit balance for the whole page, shared by the header and the studio.
// Seeded by the server, kept current by the Realtime subscription in <CreditBalance />,
// and adjusted optimistically when the studio spends credits.
let balance: number | null = null;
const listeners = new Set<() => void>();

export function setCredits(next: number) {
  if (next === balance) return;
  balance = next;
  listeners.forEach((l) => l());
}

export function adjustCredits(delta: number) {
  if (balance !== null) setCredits(Math.max(0, balance + delta));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The live balance, falling back to the server-rendered value until the store is seeded. */
export function useCredits(initial: number) {
  const value = useSyncExternalStore(
    subscribe,
    () => balance,
    () => null,
  );
  return value ?? initial;
}
