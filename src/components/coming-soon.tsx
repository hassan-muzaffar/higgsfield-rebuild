"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Features we've designed for but not built yet (lip-sync, upscale, voiceover-to-video, teams). */
export const COMING_SOON = {
  lipsync: "Coming soon: make a face in a photo speak your voiceover.",
  upscale: "Coming soon: enlarge images up to 4× with sharper detail.",
  mergeVoiceover: "Coming soon: lay one of your voiceovers over this video.",
  teams: "Coming soon: shared workspaces and credits for your team.",
} as const;

export function SoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded bg-primary/15 px-1 py-px text-[10px] font-medium tracking-wide text-primary uppercase",
        className,
      )}
    >
      Soon
    </span>
  );
}

/** A disabled action with a "Soon" badge and a tooltip explaining the feature. Never does anything. */
export function ComingSoonButton({ icon: Icon, label, reason }: { icon: LucideIcon; label: string; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons don't get hover or focus, so the wrapper carries the tooltip. */}
        <span tabIndex={0} aria-label={`${label}. ${reason}`} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring">
          <Button size="sm" variant="secondary" disabled className="pointer-events-none" tabIndex={-1}>
            <Icon aria-hidden="true" />
            {label}
            <SoonBadge />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{reason}</TooltipContent>
    </Tooltip>
  );
}
