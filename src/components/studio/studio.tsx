"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { GenerationDetail } from "@/components/generation-detail";
import { downloadGeneration } from "@/lib/generations/client-actions";
import type { Draft } from "@/lib/generations/draft-types";
import { useFavorites } from "@/lib/generations/use-favorites";
import { GenerationCard } from "@/components/studio/generation-card";
import { PromptBar, type Submission } from "@/components/studio/prompt-bar";
import { useSignedUrls } from "@/components/studio/use-signed-urls";
import { adjustCredits, useCredits } from "@/lib/credits-store";
import { imageCost, videoCost, voiceCost } from "@/lib/generations/config";
import type { Generation, GenerationMode, Preset } from "@/lib/generations/types";
import { createClient } from "@/lib/supabase/client";
import { subscribeAsUser } from "@/lib/supabase/realtime";

const EXAMPLE_PROMPTS = [
  "A lone astronaut walking through a neon-lit Tokyo alley in the rain, cinematic, 35mm film",
  "Studio product shot of a matte black perfume bottle on wet volcanic rock, soft rim light",
  "A cosy reading nook in a treehouse at golden hour, Studio Ghibli style",
];

type Props = {
  userId: string;
  initialCredits: number;
  initialGenerations: Generation[];
  initialFavoriteIds: string[];
  draft?: Draft;
  presets: Preset[];
};

/** What a submission will create and cost, for placeholder cards and the optimistic balance. */
function describe(s: Submission): { count: number; cost: number; mode: GenerationMode; params: Generation["params"] } {
  switch (s.kind) {
    case "image":
      return {
        count: s.count,
        cost: imageCost(s.count),
        mode: s.referencePath ? "edit" : "text",
        params: { aspectRatio: s.aspectRatio },
      };
    case "video":
      return {
        count: 1,
        cost: videoCost(s.durationSeconds),
        mode: s.startFramePath ? "image_to_video" : "text",
        params: { aspectRatio: s.aspectRatio, durationSeconds: s.durationSeconds },
      };
    case "voice":
      return {
        count: 1,
        cost: voiceCost(s.prompt.length),
        mode: "tts",
        params: { voice: s.voice, style: s.style, characters: s.prompt.length },
      };
  }
}

function sortNewestFirst(list: Generation[]) {
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function Studio({ userId, initialCredits, initialGenerations, initialFavoriteIds, draft, presets }: Props) {
  const credits = useCredits(initialCredits);
  const [items, setItems] = useState<Generation[]>(initialGenerations);
  const [prompt, setPrompt] = useState(draft?.prompt ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const favorites = useFavorites(userId, initialFavoriteIds);

  // A draft arrives as ?animate=<id> etc.; drop the query so a reload doesn't re-apply it.
  // history.replaceState (not router.replace) keeps the current render, and with it the draft.
  useEffect(() => {
    if (draft) window.history.replaceState(null, "", "/create");
  }, [draft]);

  const upsert = useCallback((incoming: Generation[]) => {
    setItems((prev) => {
      const byId = new Map(prev.map((g) => [g.id, g]));
      for (const g of incoming) byId.set(g.id, { ...byId.get(g.id), ...g });
      return sortNewestFirst([...byId.values()]);
    });
  }, []);

  const remove = useCallback((ids: string[]) => {
    setItems((prev) => prev.filter((g) => !ids.includes(g.id)));
  }, []);

  // Live status updates for this user's generations.
  useEffect(() => {
    return subscribeAsUser(`generations:${userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generations", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") remove([(payload.old as { id: string }).id]);
          else upsert([payload.new as Generation]);
        },
      ),
    );
  }, [userId, upsert, remove]);

  // Safety net for Realtime: while anything is still generating, ask the server every few seconds.
  // For a running video this also makes the server check the provider and save the result, which
  // is how a video finishes if the page was closed or reloaded mid-generation.
  const pendingIds = items
    .filter((g) => (g.status === "queued" || g.status === "running") && !g.id.startsWith("temp-"))
    .map((g) => g.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const ids = pendingIds.split(",");
    const timer = setInterval(() => {
      for (const id of ids) {
        fetch(`/api/generations/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((body) => body?.generation && upsert([body.generation]))
          .catch(() => {});
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingIds, upsert]);

  const outputPaths = useMemo(
    () => items.filter((g) => g.status === "succeeded").flatMap((g) => g.output_paths),
    [items],
  );
  const urls = useSignedUrls(outputPaths);

  async function generate(submission: Submission) {
    const { count, cost, mode, params } = describe(submission);
    // Show placeholder cards immediately; swap them for the real jobs when the server replies.
    const now = new Date().toISOString();
    const temps: Generation[] = Array.from({ length: count }, () => ({
      id: `temp-${crypto.randomUUID()}`,
      user_id: userId,
      kind: submission.kind,
      mode,
      model: "",
      prompt: submission.prompt,
      final_prompt: submission.prompt,
      preset_id: null,
      params,
      input_paths: [],
      output_paths: [],
      status: "queued",
      provider_op_id: null,
      error: null,
      cost: 0,
      refunded: false,
      is_public: false,
      share_slug: null,
      parent_id: null,
      created_at: now,
      completed_at: null,
    }));
    upsert(temps);
    adjustCredits(-cost);

    const tempIds = temps.map((t) => t.id);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      const body = await res.json();
      remove(tempIds);
      if (!res.ok) {
        adjustCredits(cost);
        toast.error(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      upsert(body.generations);
    } catch {
      remove(tempIds);
      adjustCredits(cost);
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
  }

  async function retry(failed: Generation) {
    adjustCredits(-failed.cost);
    const res = await fetch(`/api/generations/${failed.id}/retry`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      adjustCredits(failed.cost);
      toast.error(body.error ?? "Couldn't retry. Please try again.");
      return;
    }
    remove([failed.id]);
    upsert([body.generation]);
  }

  async function dismiss(failed: Generation) {
    remove([failed.id]);
    const { error } = await createClient().from("generations").delete().eq("id", failed.id);
    if (error) {
      upsert([failed]);
      toast.error("Couldn't remove it. Please try again.");
    }
  }

  function download(g: Generation) {
    downloadGeneration(g).catch((error) => toast.error(error instanceof Error ? error.message : "Download failed."));
  }

  const finished = useMemo(() => items.filter((g) => g.status === "succeeded"), [items]);

  function reusePrompt(text: string) {
    setPrompt(text);
    toast.success("Prompt copied to the prompt bar");
  }

  return (
    <div className="flex flex-1 flex-col">
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
            <SparklesIcon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">What will you create first?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe an image or a video, write a voiceover script, or start from one of these.
          </p>
          <div className="mt-6 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="rounded-xl border bg-card p-4 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <section aria-label="Your creations" className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((g) => (
            <GenerationCard
              key={g.id}
              generation={g}
              mediaUrl={g.output_paths[0] ? urls[g.output_paths[0]] : undefined}
              onRetry={retry}
              onDismiss={dismiss}
              onUsePrompt={reusePrompt}
              onDownload={download}
              onOpen={(item) => setOpenId(item.id)}
              favorite={favorites.isFavorite(g.id)}
              onToggleFavorite={(item) => favorites.toggle(item.id)}
            />
          ))}
        </section>
      )}

      <div className="sticky bottom-4 z-30 mx-auto mt-6 w-full max-w-3xl">
        <PromptBar
          userId={userId}
          credits={credits}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={generate}
          draft={draft}
          presets={presets}
        />
      </div>

      <GenerationDetail
        items={finished}
        openId={openId}
        onOpenIdChange={setOpenId}
        urls={urls}
        isFavorite={favorites.isFavorite}
        onToggleFavorite={(g) => favorites.toggle(g.id)}
        onDeleted={(id) => remove([id])}
      />
    </div>
  );
}
