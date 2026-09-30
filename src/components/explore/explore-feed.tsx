"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangleIcon, AudioLinesIcon, CompassIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExploreFilter, PublicGeneration } from "@/lib/generations/public";
import { cn } from "@/lib/utils";

const FILTERS: { id: ExploreFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "voice", label: "Voice" },
];
const PAGE_SIZE = 24;

type Props = { filter: ExploreFilter; initialItems: PublicGeneration[]; loadError: boolean };

export function ExploreFeed({ filter, initialItems, loadError }: Props) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/explore?type=${filter}&offset=${items.length}`);
      if (!res.ok) throw new Error();
      const { items: page } = (await res.json()) as { items: PublicGeneration[] };
      setItems((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...page.filter((g) => !seen.has(g.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, filter, items.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore, error]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
          <p className="mt-1 text-sm text-muted-foreground">What people are making with OneShot. Try any prompt yourself.</p>
        </div>
        <nav aria-label="Filter" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={f.id === "all" ? "/explore" : `/explore?type=${f.id}`}
              scroll={false}
              aria-current={f.id === filter ? "page" : undefined}
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-20 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
            <CompassIcon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold">Nothing shared here yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Make something great, then choose Share in its details to show it here.
          </p>
          <Button asChild className="mt-6">
            <Link href="/create">Start creating</Link>
          </Button>
        </div>
      ) : (
        <section aria-label="Shared creations" className="columns-2 gap-3 md:columns-3 xl:columns-4">
          {items.map((g) => (
            <ExploreCard key={g.id} generation={g} />
          ))}
          {loading &&
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mb-3 aspect-square w-full break-inside-avoid rounded-xl" />)}
        </section>
      )}

      {error && (
        <div role="alert" className="mt-6 flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
          <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the feed.</p>
          <Button variant="secondary" size="sm" onClick={() => (items.length ? loadMore() : window.location.reload())}>
            Try again
          </Button>
        </div>
      )}
      <div ref={sentinel} aria-hidden="true" />
    </>
  );
}

function ExploreCard({ generation: g }: { generation: PublicGeneration }) {
  const video = useRef<HTMLVideoElement>(null);
  const [w, h] = (g.params.aspectRatio ?? "1:1").split(":").map(Number);
  const aspect = g.kind === "voice" ? "1 / 1" : w && h ? `${w} / ${h}` : "1 / 1";

  return (
    <figure
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card"
      style={{ aspectRatio: aspect }}
      onMouseEnter={() => video.current?.play().catch(() => {})}
      onMouseLeave={() => video.current?.pause()}
    >
      {!g.mediaUrl ? (
        <div className="size-full animate-pulse bg-muted" />
      ) : g.kind === "video" ? (
        <video ref={video} src={`${g.mediaUrl}#t=0.1`} muted loop playsInline preload="metadata" className="size-full object-cover" />
      ) : g.kind === "voice" ? (
        <div className="flex h-full flex-col bg-gradient-to-br from-primary/15 via-card to-card p-4">
          <AudioLinesIcon className="size-5 text-primary" aria-hidden="true" />
          <p className="mt-3 line-clamp-6 text-sm text-muted-foreground">“{g.prompt}”</p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
        <img src={g.mediaUrl} alt={g.prompt} loading="lazy" className="size-full object-cover" />
      )}

      {g.kind === "video" && (
        <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          <PlayIcon className="size-3 fill-current" aria-hidden="true" />
          {g.params.durationSeconds ?? 8}s
        </span>
      )}

      <Link
        href={`/g/${g.share_slug}`}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        aria-label={`Open: ${g.prompt}`}
      />

      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs text-white/90">{g.prompt}</p>
          <p className="mt-1 truncate text-[11px] text-white/60">{g.creator_name ?? "A OneShot creator"}</p>
        </div>
        <Button asChild size="sm" variant="secondary" className="pointer-events-auto relative z-10 h-7 shrink-0 bg-black/60 text-xs hover:bg-black/80">
          <Link href={`/create?try=${g.share_slug}`}>
            <SparklesIcon aria-hidden="true" />
            Try
          </Link>
        </Button>
      </figcaption>
    </figure>
  );
}
