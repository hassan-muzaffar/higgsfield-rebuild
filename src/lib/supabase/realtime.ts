"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Opens a Realtime channel as the signed-in user. Without this, a channel opened on page load
 * can join before the browser client has read the session cookie, i.e. as an anonymous visitor,
 * and RLS then silently filters out every event for the user's own rows.
 * Returns an unsubscribe function.
 */
export function subscribeAsUser(name: string, configure: (channel: RealtimeChannel) => RealtimeChannel) {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  supabase.auth.getSession().then(async ({ data }) => {
    if (cancelled) return;
    if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    channel = configure(supabase.channel(name)).subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) supabase.removeChannel(channel);
  };
}
