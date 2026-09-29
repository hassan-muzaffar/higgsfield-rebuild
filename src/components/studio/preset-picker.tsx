"use client";

import { useState } from "react";
import { CheckIcon, PaletteIcon, VideoIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Preset } from "@/lib/generations/types";
import { cn } from "@/lib/utils";

type Props = {
  kind: "image" | "video";
  presets: Preset[];
  value: string | null;
  onChange: (presetId: string | null) => void;
};

export function PresetPicker({ kind, presets, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const options = presets.filter((p) => p.kind === kind);
  const selected = options.find((p) => p.id === value);
  const label = kind === "image" ? "Style" : "Camera";
  const Icon = kind === "image" ? PaletteIcon : VideoIcon;

  if (!options.length) return null;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className={cn(selected && "rounded-r-none bg-primary/15 text-primary hover:bg-primary/20")}
            aria-label={selected ? `${label}: ${selected.name}. Change` : `Choose a ${label.toLowerCase()} preset`}
          >
            <Icon aria-hidden="true" />
            {selected ? selected.name : label}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,34rem)] p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {kind === "image" ? "Pick a style. It's added to your prompt behind the scenes." : "Pick a camera move for your shot."}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="listbox" aria-label={`${label} presets`}>
            {options.map((preset) => {
              const active = preset.id === value;
              return (
                <button
                  key={preset.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(active ? null : preset.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    active ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
                  )}
                >
                  <div className={cn("overflow-hidden bg-muted", kind === "image" ? "aspect-square" : "aspect-video")}>
                    {preset.thumbnail_path && (
                      // eslint-disable-next-line @next/next/no-img-element -- small static thumbnails
                      <img
                        src={preset.thumbnail_path}
                        alt=""
                        loading="lazy"
                        className={cn(
                          "size-full object-cover",
                          kind === "video" ? `camera-move camera-${preset.slug}` : "transition-transform duration-500 group-hover:scale-105",
                        )}
                      />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium">{preset.name}</p>
                    {preset.description && <p className="truncate text-[11px] text-muted-foreground">{preset.description}</p>}
                  </div>
                  {active && (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          variant="secondary"
          size="sm"
          className="rounded-l-none border-l border-primary/20 bg-primary/15 px-2 text-primary hover:bg-primary/20"
          aria-label={`Remove ${selected.name} preset`}
          onClick={() => onChange(null)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
