import { NextResponse } from "next/server";
import { ProviderError } from "@/lib/ai/google";
import { transcribe } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/supabase/server";

export const maxDuration = 60;

// A minute of compressed speech is well under 2 MB; this leaves room for WAV from some browsers.
const MAX_BYTES = 8 * 1024 * 1024;
const HOURLY_LIMIT = 30;

/** Dictation: turns a short recording into prompt text. Free, but limited per user. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No recording received. Please try again." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });
  }
  if (!/^audio\/|^video\/webm|^video\/mp4/.test(audio.type)) {
    return NextResponse.json({ error: "Unsupported recording format." }, { status: 415 });
  }

  const { data: allowed } = await createAdminClient().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_action: "transcribe",
    p_limit: HOURLY_LIMIT,
    p_window: "1 hour",
  });
  if (!allowed) {
    return NextResponse.json({ error: "You've used dictation a lot this hour. Please type for now, or try again later." }, { status: 429 });
  }

  try {
    const text = await transcribe(audio);
    if (!text) return NextResponse.json({ error: "We couldn't hear anything. Please try again." }, { status: 422 });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("[transcribe] failed:", error);
    const message =
      error instanceof ProviderError
        ? error.userMessage.replace(" Your credits were refunded.", "")
        : "Dictation failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
