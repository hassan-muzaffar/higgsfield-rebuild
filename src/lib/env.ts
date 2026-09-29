import { z } from "zod";

// Public values are inlined into the client bundle at build time, so they must be
// referenced as literal `process.env.NEXT_PUBLIC_*` expressions.
const publicEnv = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  })
  .parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

export const env = publicEnv;

/** Server-only secrets. Throws if called without them, never imported by client code. */
export function serverEnv() {
  return z
    .object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
    .parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
}
