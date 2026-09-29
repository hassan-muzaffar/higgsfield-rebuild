"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  CopyIcon,
  DownloadIcon,
  HeartIcon,
  Loader2Icon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { VOICES } from "@/lib/generations/config";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Generation } from "@/lib/generations/types";
import { cn } from "@/lib/utils";

type Props = {
  generation: Generation;
  mediaUrl?: string;
  onRetry?: (g: Generation) => void;
  onDismiss?: (g: Generation) => void;
  onUsePrompt: (prompt: string) => void;
  onDownload: (g: Generation) => void;
  /** Opens the detail panel. */
  onOpen?: (g: Generation) => void;
  favorite?: boolean;
  onToggleFavorite?: (g: Generation) => void;
  className?: string;
};

function aspectStyle(g: Generation) {
  if (g.kind === "voice") return { aspectRatio: "1 / 1" };
  const ratio = g.params.aspectRatio;
  const [w, h] = (ratio ?? "1:1").split(":").map(Number);
  return { aspectRatio: w && h ? `${w} / ${h}` : "1 / 1" };
}

export function GenerationCard({
  generation: g,
  mediaUrl,
  onRetry,
  onDismiss,
  onUsePrompt,
  onDownload,
  onOpen,
  favorite = false,
  onToggleFavorite,
  className,
}: Props) {
  const pending = g.status === "queued" || g.status === "running";
  const done = g.status === "succeeded";

  return (
    <figure className={cn("group relative overflow-hidden rounded-xl border bg-card", className)} style={aspectStyle(g)}>
      {pending && <PendingState createdAt={g.created_at} kind={g.kind} />}

      {g.status === "failed" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{g.error ?? "Generation failed. Your credits were refunded."}</p>
          <div className="flex gap-2">
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={() => onRetry(g)}>
                <RotateCcwIcon aria-hidden="true" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={() => onDismiss(g)} aria-label="Dismiss">
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      )}

      {g.status === "succeeded" && g.kind === "voice" && (
        <VoiceResult generation={g} src={mediaUrl} onUsePrompt={onUsePrompt} onDownload={onDownload} />
      )}

      {g.status === "succeeded" &&
        g.kind !== "voice" &&
        (!mediaUrl ? (
          <div className="size-full animate-pulse bg-muted" />
        ) : g.kind === "video" ? (
          <HoverVideo src={mediaUrl} label={g.prompt} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; optimising them would cache per-URL
          <img src={mediaUrl} alt={g.prompt} className="size-full object-cover" loading="lazy" />
        ))}

      {g.kind === "video" && g.status === "succeeded" && (
        <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white tabular-nums">
          <PlayIcon className="size-3 fill-current" aria-hidden="true" />
          {g.params.durationSeconds ?? 8}s
        </span>
      )}

      {/* Clicking an image or video opens its details; the action buttons sit above this layer. */}
      {done && g.kind !== "voice" && onOpen && (
        <button
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          aria-label="Open details"
          onClick={() => onOpen(g)}
        />
      )}

      {done && (onToggleFavorite || (onOpen && g.kind === "voice")) && (
        <div
          className={cn(
            "absolute top-2 right-2 flex gap-1 transition-opacity",
            favorite ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          {onOpen && g.kind === "voice" && (
            <CardAction label="Open details" onClick={() => onOpen(g)}>
              <Maximize2Icon aria-hidden="true" />
            </CardAction>
          )}
          {onToggleFavorite && (
            <CardAction
              label={favorite ? "Remove from favourites" : "Add to favourites"}
              onClick={() => onToggleFavorite(g)}
              pressed={favorite}
            >
              <HeartIcon className={cn(favorite && "fill-red-500 text-red-500")} aria-hidden="true" />
            </CardAction>
          )}
        </div>
      )}

      {g.status === "succeeded" && g.kind !== "voice" && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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

function CardAction({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="secondary"
          className="pointer-events-auto relative z-10 shrink-0 bg-black/60 hover:bg-black/80"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function formatTime(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function VoiceResult({
  generation: g,
  src,
  onUsePrompt,
  onDownload,
}: {
  generation: Generation;
  src?: string;
  onUsePrompt: (prompt: string) => void;
  onDownload: (g: Generation) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const voiceLabel = VOICES.find((v) => v.id === g.params.voice)?.label ?? "Voice";

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-primary/15 via-card to-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AudioLinesIcon className="size-4 text-primary" aria-hidden="true" />
        <span className="font-medium text-foreground">{voiceLabel}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tracking-wide uppercase">AI voice</span>
      </div>

      <p className="mt-3 line-clamp-4 flex-1 text-sm text-pretty text-muted-foreground">“{g.prompt}”</p>

      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button
          size="icon"
          className="shrink-0 rounded-full"
          disabled={!src}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}
        >
          {playing ? <PauseIcon className="fill-current" aria-hidden="true" /> : <PlayIcon className="fill-current" aria-hidden="true" />}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value);
            }}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer accent-primary"
          />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatTime(time)} / {formatTime(duration)}
          </span>
        </div>
        <CardAction label="Use this script" onClick={() => onUsePrompt(g.prompt)}>
          <CopyIcon aria-hidden="true" />
        </CardAction>
        <CardAction label="Download" onClick={() => onDownload(g)}>
          <DownloadIcon aria-hidden="true" />
        </CardAction>
      </div>
    </div>
  );
}

function HoverVideo({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <video
      ref={ref}
      // #t=0.1 shows the first frame as a poster without downloading the whole clip.
      src={`${src}#t=0.1`}
      aria-label={label}
      className="size-full object-cover"
      muted
      loop
      playsInline
      preload="metadata"
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        ref.current?.pause();
      }}
      onFocus={() => ref.current?.play().catch(() => {})}
      onBlur={() => ref.current?.pause()}
      tabIndex={0}
    />
  );
}

function PendingState({ createdAt, kind }: { createdAt: string; kind: Generation["kind"] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center">
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent",
          "animate-[shimmer_1.6s_infinite] bg-[length:200%_100%]",
        )}
      />
      <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground" role="status">
        {kind === "video" ? "Generating video…" : kind === "voice" ? "Recording voiceover…" : "Generating…"} <span className="tabular-nums">{elapsed}</span>
      </p>
      {kind === "video" && (
        <p className="text-[11px] text-muted-foreground/70">Usually 1–3 minutes. You can leave this page.</p>
      )}
    </div>
  );
}
