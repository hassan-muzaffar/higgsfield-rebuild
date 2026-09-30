"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLinesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  HeartIcon,
  LinkIcon,
  LockIcon,
  Share2Icon,
  Loader2Icon,
  RotateCcwIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VOICE_STYLES, VOICES } from "@/lib/generations/config";
import { deleteGeneration, downloadGeneration } from "@/lib/generations/client-actions";
import type { Generation } from "@/lib/generations/types";
import { cn } from "@/lib/utils";

type Props = {
  /** The generations the panel can step through with ← and →. */
  items: Generation[];
  openId: string | null;
  onOpenIdChange: (id: string | null) => void;
  urls: Record<string, string>;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (g: Generation) => void;
  onDeleted: (id: string) => void;
  /** Called when sharing changes, so the list can update its copy. */
  onUpdated: (id: string, changes: Partial<Generation>) => void;
};

const KIND_LABEL = { image: "Image", video: "Video", voice: "Voiceover" } as const;
const MODE_LABEL = { text: "From text", edit: "Edited image", image_to_video: "Animated image", tts: "Text to speech" } as const;

export function GenerationDetail({
  items,
  openId,
  onOpenIdChange,
  urls,
  isFavorite,
  onToggleFavorite,
  onDeleted,
  onUpdated,
}: Props) {
  const router = useRouter();
  const index = items.findIndex((g) => g.id === openId);
  const g = index >= 0 ? items[index] : null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  // ← / → step through items while the panel is open (Esc is handled by the sheet).
  useEffect(() => {
    if (!g) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable], video, audio") || confirmDelete) return;
      if (e.key === "ArrowLeft" && prev) onOpenIdChange(prev.id);
      if (e.key === "ArrowRight" && next) onOpenIdChange(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g, prev, next, onOpenIdChange, confirmDelete]);

  function chain(action: "reuse" | "animate" | "edit" | "voiceover") {
    if (!g) return;
    onOpenIdChange(null);
    router.push(`/create?${action}=${g.id}`);
  }

  async function copyPrompt() {
    if (!g) return;
    await navigator.clipboard.writeText(g.prompt);
    toast.success("Prompt copied");
  }

  async function copyLink(slug: string) {
    const url = `${window.location.origin}/g/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.message("Share link", { description: url });
    }
  }

  async function setPublic(makePublic: boolean) {
    if (!g) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/generations/${g.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: makePublic }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't update sharing.");
      onUpdated(g.id, { is_public: body.isPublic, share_slug: body.slug });
      if (makePublic) await copyLink(body.slug);
      else toast.success("Now private. The link no longer works.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update sharing.");
    } finally {
      setSharing(false);
    }
  }

  async function remove() {
    if (!g) return;
    setDeleting(true);
    try {
      await deleteGeneration(g.id);
      setConfirmDelete(false);
      // Move to a neighbour so the panel stays useful, or close if this was the last one.
      onOpenIdChange(next?.id ?? prev?.id ?? null);
      onDeleted(g.id);
      toast.success("Deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete it.");
    } finally {
      setDeleting(false);
    }
  }

  const url = g?.output_paths[0] ? urls[g.output_paths[0]] : undefined;
  const favorite = g ? isFavorite(g.id) : false;

  return (
    <>
      <Sheet open={!!g} onOpenChange={(open) => !open && onOpenIdChange(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
          {g && (
            <>
              <SheetHeader className="flex-row items-center gap-2 border-b p-4 pr-12">
                <Badge variant="secondary">{KIND_LABEL[g.kind]}</Badge>
                <SheetTitle className="sr-only">{KIND_LABEL[g.kind]} details</SheetTitle>
                <SheetDescription className="text-xs">{formatDate(g.created_at)}</SheetDescription>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!prev}
                    onClick={() => prev && onOpenIdChange(prev.id)}
                    aria-label="Previous"
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!next}
                    onClick={() => next && onOpenIdChange(next.id)}
                    aria-label="Next"
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                </div>
              </SheetHeader>

              <div className="bg-black/40">
                <Media generation={g} url={url} />
              </div>

              <div className="space-y-5 p-4">
                <section aria-label="Prompt">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase">
                      {g.kind === "voice" ? "Script" : "Prompt"}
                    </h3>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyPrompt}>
                      <CopyIcon aria-hidden="true" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{g.prompt}</p>
                </section>

                <div className="flex flex-wrap gap-2">
                  {g.kind === "image" && (
                    <>
                      <Button size="sm" onClick={() => chain("animate")}>
                        <ClapperboardIcon aria-hidden="true" />
                        Animate this
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => chain("edit")}>
                        <WandSparklesIcon aria-hidden="true" />
                        Edit this
                      </Button>
                    </>
                  )}
                  {g.kind !== "voice" && (
                    <Button size="sm" variant="secondary" onClick={() => chain("voiceover")}>
                      <AudioLinesIcon aria-hidden="true" />
                      Add voiceover
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => chain("reuse")}>
                    <RotateCcwIcon aria-hidden="true" />
                    Reuse
                  </Button>
                </div>

                <Separator />

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {details(g).map(([term, value]) => (
                    <div key={term}>
                      <dt className="text-xs text-muted-foreground">{term}</dt>
                      <dd className="mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>

                <Separator />

                <section aria-label="Sharing" className="flex flex-wrap items-center gap-2">
                  {g.is_public && g.share_slug ? (
                    <>
                      <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GlobeIcon className="size-3.5 text-primary" aria-hidden="true" />
                        Public: anyone with the link, and in Explore
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => copyLink(g.share_slug!)}>
                        <LinkIcon aria-hidden="true" />
                        Copy link
                      </Button>
                      <Button size="sm" variant="ghost" disabled={sharing} onClick={() => setPublic(false)}>
                        {sharing ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <LockIcon aria-hidden="true" />}
                        Make private
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <LockIcon className="size-3.5" aria-hidden="true" />
                        Private: only you can see this
                      </span>
                      <Button size="sm" variant="secondary" disabled={sharing} onClick={() => setPublic(true)}>
                        {sharing ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <Share2Icon aria-hidden="true" />}
                        Share
                      </Button>
                    </>
                  )}
                </section>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      downloadGeneration(g).catch((e) => toast.error(e instanceof Error ? e.message : "Download failed"))
                    }
                  >
                    <DownloadIcon aria-hidden="true" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-pressed={favorite}
                    onClick={() => onToggleFavorite(g)}
                  >
                    <HeartIcon className={cn(favorite && "fill-red-500 text-red-500")} aria-hidden="true" />
                    {favorite ? "Favourited" : "Favourite"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmDelete} onOpenChange={(open) => !deleting && setConfirmDelete(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this {g ? KIND_LABEL[g.kind].toLowerCase() : "item"}?</DialogTitle>
            <DialogDescription>It will be removed from your library and its file deleted. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Media({ generation: g, url }: { generation: Generation; url?: string }) {
  if (!url) return <div className="aspect-video w-full animate-pulse bg-muted" />;
  if (g.kind === "video") {
    return (
      <video key={url} src={url} controls autoPlay loop playsInline className="mx-auto max-h-[60vh] w-full object-contain" />
    );
  }
  if (g.kind === "voice") {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10">
        <div className="grid size-16 place-items-center rounded-full bg-primary/15">
          <AudioLinesIcon className="size-7 text-primary" aria-hidden="true" />
        </div>
        <audio key={url} src={url} controls className="w-full" />
        <p className="text-xs text-muted-foreground">AI-generated voice</p>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
  return <img src={url} alt={g.prompt} className="mx-auto max-h-[60vh] w-full object-contain" />;
}

function details(g: Generation): [string, string][] {
  const rows: [string, string][] = [["Type", `${KIND_LABEL[g.kind]} · ${MODE_LABEL[g.mode]}`]];
  if (g.kind === "image") rows.push(["Aspect ratio", g.params.aspectRatio ?? "1:1"]);
  if (g.kind === "video") {
    rows.push(["Aspect ratio", g.params.aspectRatio ?? "16:9"], ["Duration", `${g.params.durationSeconds ?? 8}s`]);
  }
  if (g.kind === "voice") {
    rows.push(
      ["Voice", VOICES.find((v) => v.id === g.params.voice)?.label ?? String(g.params.voice)],
      ["Style", VOICE_STYLES.find((s) => s.id === g.params.style)?.label ?? String(g.params.style)],
    );
  }
  rows.push(["Model", g.model], ["Cost", `${g.cost} credits`]);
  return rows;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
