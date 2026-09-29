"use client";

import { useEffect, useState } from "react";
import { AlertTriangleIcon, CopyIcon, DownloadIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Generation } from "@/lib/generations/types";
import { cn } from "@/lib/utils";

type Props = {
  generation: Generation;
  imageUrl?: string;
  onRetry: (g: Generation) => void;
  onDismiss: (g: Generation) => void;
  onUsePrompt: (prompt: string) => void;
  onDownload: (g: Generation) => void;
};

function aspectStyle(ratio?: string) {
  const [w, h] = (ratio ?? "1:1").split(":").map(Number);
  return { aspectRatio: w && h ? `${w} / ${h}` : "1 / 1" };
}

export function GenerationCard({ generation: g, imageUrl, onRetry, onDismiss, onUsePrompt, onDownload }: Props) {
  const pending = g.status === "queued" || g.status === "running";

  return (
    <figure
      className="group relative overflow-hidden rounded-xl border bg-card"
      style={aspectStyle(g.params.aspectRatio)}
    >
      {pending && <PendingState createdAt={g.created_at} />}

      {g.status === "failed" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{g.error ?? "Generation failed. Your credits were refunded."}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onRetry(g)}>
              <RotateCcwIcon aria-hidden="true" />
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(g)} aria-label="Dismiss">
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {g.status === "succeeded" &&
        (imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; optimising them would cache per-URL
          <img src={imageUrl} alt={g.prompt} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="size-full animate-pulse bg-muted" />
        ))}

      {g.status === "succeeded" && (
        <figcaption className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <p className="line-clamp-2 flex-1 text-xs text-white/90">{g.prompt}</p>
          <CardAction label="Use this prompt" onClick={() => onUsePrompt(g.prompt)}>
            <CopyIcon aria-hidden="true" />
          </CardAction>
          <CardAction label="Download" onClick={() => onDownload(g)}>
            <DownloadIcon aria-hidden="true" />
          </CardAction>
        </figcaption>
      )}
    </figure>
  );
}

function CardAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="secondary" className="shrink-0 bg-black/60 hover:bg-black/80" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PendingState({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden">
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent",
          "animate-[shimmer_1.6s_infinite] bg-[length:200%_100%]",
        )}
      />
      <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground" role="status">
        Generating… <span className="tabular-nums">{seconds}s</span>
      </p>
    </div>
  );
}
