// Credit packs, shared by the pricing page, billing page and checkout.
export const CREDIT_PACKS = [
  { id: "starter", name: "Starter", credits: 100, priceCents: 500, blurb: "Try everything: about 50 images or 3 videos." },
  { id: "creator", name: "Creator", credits: 350, priceCents: 1500, blurb: "For regular creating. Best for most people.", popular: true },
  { id: "pro", name: "Pro", credits: 1000, priceCents: 4000, blurb: "For heavy video work, at the lowest price per credit." },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];
export type CreditPackId = CreditPack["id"];
export const CREDIT_PACK_IDS = CREDIT_PACKS.map((p) => p.id) as [CreditPackId, ...CreditPackId[]];

export function findPack(id: string | null | undefined) {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
