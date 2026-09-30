"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangleIcon, AudioLinesIcon, ClapperboardIcon, HeartIcon, ImageIcon, ImagesIcon } from "lucide-react";
import { toast } from "sonner";
import { GenerationDetail } from "@/components/generation-detail";
import { GenerationCard } from "@/components/studio/generation-card";
import { useSignedUrls } from "@/components/studio/use-signed-urls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadGeneration } from "@/lib/generations/client-actions";
import {
  fetchLibraryPage,
  LIBRARY_FILTERS,
  LIBRARY_PAGE_SIZE,
  type LibraryFilter,
} from "@/lib/generations/library";
import type { Generation } from "@/lib/generations/types";
import { useFavorites } from "@/lib/generations/use-favorites";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  filter: LibraryFilter;
  initialItems: Generation[];
  initialFavoriteIds: string[];
  loadError: boolean;
};

const EMPTY: Record<LibraryFilter, { icon: typeof ImagesIcon; title: string; text: string }> = {
  all: { icon: ImagesIcon, title: "Your library is empty", text: "Everything you create (images, videos and voiceovers) is saved here." },
  image: { icon: ImageIcon, title: "No images yet", text: "Images you generate or edit will show up here." },
  video: { icon: ClapperboardIcon, title: "No videos yet", text: "Create a clip from a prompt, or animate one of your images." },
  voice: { icon: AudioLinesIcon, title: "No voiceovers yet", text: "Write a script on the Voice tab to create one." },
  favorites: { icon: HeartIcon, title: "No favourites yet", text: "Tap the heart on anything you love to keep it here." },
};

export function LibraryView({ userId, filter, initialItems, initialFavoriteIds, loadError }: Props) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === LIBRARY_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);
  const [openId, setOpenId] = useState<string | null>(null);
  const favorites = useFavorites(userId, initialFavoriteIds);
  const sentinel = useRef<HTMLDivElement>(null);

  const urls = useSignedUrls(useMemo(() => items.flatMap((g) => g.output_paths), [items]));

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const page = await fetchLibraryPage(createClient(), filter, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...page.filter((g) => !seen.has(g.id))];
      });
      setHasMore(page.length === LIBRARY_PAGE_SIZE);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, filter, items.length]);

  // Infinite scroll: load the next page when the sentinel below the grid comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: "600px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore, error]);

  function toggleFavorite(g: Generation) {
    const wasFavorite = favorites.isFavorite(g.id);
    favorites.toggle(g.id);
    // In the Favourites view, un-favouriting removes the item (it comes back if the save fails on reload).
    if (filter === "favorites" && wasFavorite && openId !== g.id) {
      setItems((prev) => prev.filter((item) => item.id !== g.id));
    }
  }

  const empty = EMPTY[filter];

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <nav aria-label="Filter" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
          {LIBRARY_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={f.id === "all" ? "/library" : `/library?type=${f.id}`}
              aria-current={f.id === filter ? "page" : undefined}
              scroll={false}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                f.id === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {items.length === 0 && !error ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-20 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
            <empty.icon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold">{empty.title}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{empty.text}</p>
          <Button asChild className="mt-6">
            <Link href="/create">Create something</Link>
          </Button>
        </div>
      ) : (
        <section aria-label="Your creations" className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {items.map((g) => (
            <GenerationCard
              key={g.id}
              className="mb-3 break-inside-avoid"
              generation={g}
              mediaUrl={g.output_paths[0] ? urls[g.output_paths[0]] : undefined}
              onUsePrompt={async (text) => {
                await navigator.clipboard.writeText(text);
                toast.success("Prompt copied");
              }}
              onDownload={(item) =>
                downloadGeneration(item).catch((e) => toast.error(e instanceof Error ? e.message : "Download failed."))
              }
              onOpen={(item) => setOpenId(item.id)}
              favorite={favorites.isFavorite(g.id)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
          {loading &&
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="mb-3 aspect-square w-full break-inside-avoid rounded-xl" />
            ))}
        </section>
      )}

      {error && (
        <div role="alert" className="mt-6 flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
          <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Couldn&apos;t load your library.</p>
          <Button variant="secondary" size="sm" onClick={() => (items.length ? loadMore() : window.location.reload())}>
            Try again
          </Button>
        </div>
      )}

      <div ref={sentinel} aria-hidden="true" />

      <GenerationDetail
        items={items}
        openId={openId}
        onOpenIdChange={setOpenId}
        urls={urls}
        isFavorite={favorites.isFavorite}
        onToggleFavorite={toggleFavorite}
        onDeleted={(id) => setItems((prev) => prev.filter((g) => g.id !== id))}
        onUpdated={(id, changes) => setItems((prev) => prev.map((g) => (g.id === id ? { ...g, ...changes } : g)))}
      />
    </div>
  );
}
