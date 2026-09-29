"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpIcon,
  AudioLinesIcon,
  ClapperboardIcon,
  CoinsIcon,
  ImageIcon,
  ImagePlusIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  IMAGE_ASPECT_RATIOS,
  imageCost,
  MAX_IMAGES_PER_REQUEST,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_TYPES,
  START_FRAME_TYPES,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  videoCost,
  type ImageAspectRatio,
  type VideoAspectRatio,
  type VideoDuration,
} from "@/lib/generations/config";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Submission =
  | { kind: "image"; prompt: string; aspectRatio: ImageAspectRatio; count: number; referencePath?: string }
  | {
      kind: "video";
      prompt: string;
      aspectRatio: VideoAspectRatio;
      durationSeconds: VideoDuration;
      startFramePath?: string;
    };

export type Mode = "image" | "video";

type Reference = { path: string | null; previewUrl: string; uploading: boolean; type: string };

type Props = {
  userId: string;
  credits: number;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: (submission: Submission) => void;
};

const TABS = [
  { id: "image", label: "Image", icon: ImageIcon, ready: true },
  { id: "video", label: "Video", icon: ClapperboardIcon, ready: true },
  { id: "voice", label: "Voice", icon: AudioLinesIcon, ready: false },
] as const;

export function PromptBar({ userId, credits, prompt, onPromptChange, onSubmit }: Props) {
  const [mode, setMode] = useState<Mode>("image");
  const [imageRatio, setImageRatio] = useState<ImageAspectRatio>("1:1");
  const [videoRatio, setVideoRatio] = useState<VideoAspectRatio>("16:9");
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState<VideoDuration>(8);
  const [reference, setReference] = useState<Reference | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const allowedTypes: readonly string[] = mode === "video" ? START_FRAME_TYPES : REFERENCE_IMAGE_TYPES;
  const cost = mode === "video" ? videoCost(duration) : imageCost(count);
  const notEnoughCredits = credits < cost;
  const canSubmit = prompt.trim().length > 0 && !notEnoughCredits && !reference?.uploading;

  function switchMode(next: Mode) {
    setMode(next);
    // A WebP reference works for image edits but not as a video start frame.
    if (next === "video" && reference?.type === "image/webp") removeReference();
  }

  async function attach(file: File) {
    setFileError(null);
    if (!allowedTypes.includes(file.type)) {
      setFileError(mode === "video" ? "Use a PNG or JPG image as the start frame." : "Use a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setFileError("That image is over 10 MB. Please choose a smaller one.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setReference({ path: null, previewUrl, uploading: true, type: file.type });

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("inputs").upload(path, file, { contentType: file.type });
    if (error) {
      URL.revokeObjectURL(previewUrl);
      setReference(null);
      setFileError("Upload failed. Please try again.");
      return;
    }
    setReference({ path, previewUrl, uploading: false, type: file.type });
  }

  function removeReference() {
    if (reference) URL.revokeObjectURL(reference.previewUrl);
    setReference(null);
    setFileError(null);
  }

  function submit() {
    if (!canSubmit) return;
    const path = reference?.path ?? undefined;
    onSubmit(
      mode === "video"
        ? { kind: "video", prompt: prompt.trim(), aspectRatio: videoRatio, durationSeconds: duration, startFramePath: path }
        : { kind: "image", prompt: prompt.trim(), aspectRatio: imageRatio, count, referencePath: path },
    );
  }

  return (
    <div className="rounded-2xl border bg-popover/95 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-center gap-1 border-b px-2 pt-2" role="tablist" aria-label="What to create">
        {TABS.map(({ id, label, icon: Icon, ready }) => {
          const tab = (
            <button
              key={id}
              role="tab"
              aria-selected={id === mode}
              aria-disabled={!ready}
              onClick={() => ready && switchMode(id as Mode)}
              className={cn(
                "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 pt-1 pb-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                id === mode ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                !ready && "cursor-not-allowed opacity-50",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
          return ready ? (
            tab
          ) : (
            <Tooltip key={id}>
              <TooltipTrigger asChild>{tab}</TooltipTrigger>
              <TooltipContent>Coming in the next update</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex gap-3 p-3">
        {reference && (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={reference.previewUrl} alt={mode === "video" ? "Start frame" : "Reference image"} className="size-full object-cover" />
            {reference.uploading && (
              <div className="absolute inset-0 grid place-items-center bg-black/60">
                <Loader2Icon className="size-4 animate-spin" aria-label="Uploading" />
              </div>
            )}
            <button
              onClick={removeReference}
              className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
              aria-label={mode === "video" ? "Remove start frame" : "Remove reference image"}
            >
              <XIcon className="size-3" aria-hidden="true" />
            </button>
          </div>
        )}
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={MAX_PROMPT_LENGTH}
          rows={2}
          placeholder={
            mode === "video"
              ? reference
                ? "Describe how the scene should move, e.g. “slow push-in as the waves crash”"
                : "Describe the shot: subject, motion, camera, mood…"
              : reference
                ? "Describe the change, e.g. “make it night time”"
                : "Describe the image you want…"
          }
          aria-label="Prompt"
          className="max-h-48 min-h-12 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>

      {fileError && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {fileError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <input
          ref={fileInput}
          type="file"
          accept={allowedTypes.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attach(file);
            e.target.value = "";
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={mode === "video" ? "Add a start frame to animate" : "Add a reference image to edit"}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{mode === "video" ? "Animate an image" : "Add an image to edit"}</TooltipContent>
        </Tooltip>

        {mode === "image" ? (
          <>
            <RatioMenu value={imageRatio} options={IMAGE_ASPECT_RATIOS} onChange={setImageRatio} />
            <Segmented
              label="Number of images"
              options={Array.from({ length: MAX_IMAGES_PER_REQUEST }, (_, i) => i + 1)}
              value={count}
              onChange={setCount}
              format={(n) => String(n)}
            />
          </>
        ) : (
          <>
            <RatioMenu value={videoRatio} options={VIDEO_ASPECT_RATIOS} onChange={setVideoRatio} />
            <Segmented
              label="Duration"
              options={VIDEO_DURATIONS}
              value={duration}
              onChange={setDuration}
              format={(d) => `${d}s`}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {notEnoughCredits && (
            <Link href="/billing" className="text-xs text-primary underline-offset-2 hover:underline">
              Buy credits
            </Link>
          )}
          <Button onClick={submit} disabled={!canSubmit} className="gap-2">
            Generate
            <span className="flex items-center gap-1 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-xs tabular-nums">
              <CoinsIcon className="size-3" aria-hidden="true" />
              {cost}
            </span>
            <ArrowUpIcon className="sm:hidden" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RatioMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Aspect ratio ${value}`}>
          <RatioIcon ratio={value} />
          {value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Aspect ratio</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((ratio) => (
            <DropdownMenuRadioItem key={ratio} value={ratio}>
              <RatioIcon ratio={ratio} />
              {ratio}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Segmented<T extends number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  format: (value: T) => string;
}) {
  return (
    <div className="flex items-center rounded-md bg-secondary p-0.5" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-7 min-w-7 rounded px-2 text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            value === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 14 / Math.max(w, h);
  return (
    <span className="grid size-4 place-items-center" aria-hidden="true">
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}
