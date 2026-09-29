import { NextResponse } from "next/server";
import { z } from "zod";
import { enhancePrompt, ProviderError } from "@/lib/ai/google";
import { MAX_PROMPT_LENGTH, MAX_VOICE_CHARACTERS } from "@/lib/generations/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/supabase/server";

export const maxDuration = 30;

const HOURLY_LIMIT = 20;

const enhanceRequest = z.object({
  kind: z.enum(["image", "video", "voice"]),
  prompt: z.string().trim().min(1, "Write something to enhance first.").max(MAX_VOICE_CHARACTERS),
});

/** Prompt enhance: free, limited to 20 per user per hour. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = enhanceRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { data: allowed } = await createAdminClient().rpc("consume_rate_limit", {
    p_user_id: userId,
    p_action: "enhance",
    p_limit: HOURLY_LIMIT,
    p_window: "1 hour",
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "You've enhanced 20 prompts this hour. Try again later, or keep editing by hand." },
      { status: 429 },
    );
  }

  try {
    const { kind, prompt } = parsed.data;
    const text = await enhancePrompt(prompt, kind);
    const limit = kind === "voice" ? MAX_VOICE_CHARACTERS : MAX_PROMPT_LENGTH;
    return NextResponse.json({ prompt: text.slice(0, limit) });
  } catch (error) {
    console.error("[enhance] failed:", error);
    const message = error instanceof ProviderError ? error.userMessage : "Couldn't enhance the prompt. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
