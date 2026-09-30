"use client";

import { useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { VOICES } from "@/lib/generations/config";
import { cn } from "@/lib/utils";

/** Plays the pre-recorded voice previews on the landing page. */
export function VoiceSamples() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  function toggle(id: string) {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    const el = new Audio(`/voices/${id}.mp3`);
    el.onended = () => setPlaying(null);
    el.play().catch(() => setPlaying(null));
    audio.current = el;
    setPlaying(id);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {VOICES.map((v) => (
        <button
          key={v.id}
          onClick={() => toggle(v.id)}
          aria-pressed={playing === v.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-background/60 p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring",
            playing === v.id && "border-primary/60",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            {playing === v.id ? <PauseIcon className="size-3.5 fill-current" aria-hidden="true" /> : <PlayIcon className="size-3.5 fill-current" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            {/* The visible name starts the accessible name, so voice-control users can say "click Marin". */}
            <span className="block text-sm font-medium">
              {v.label}
              <span className="sr-only"> voice sample</span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">{v.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
