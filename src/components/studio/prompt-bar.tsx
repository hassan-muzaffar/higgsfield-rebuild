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
  PlayIcon,
  SmileIcon,
  SparklesIcon,
  SquareIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { COMING_SOON, SoonBadge } from "@/components/coming-soon";
import { DictationButton } from "@/components/studio/dictation-button";
import { PresetPicker } from "@/components/studio/preset-picker";
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
  MAX_VOICE_CHARACTERS,
  VOICE_STYLES,
  VOICES,
  voiceCost,
  type ImageAspectRatio,
  type VoiceId,
  type VoiceStyleId,
  type VideoAspectRatio,
  type VideoDuration,
} from "@/lib/generations/config";
import type { Draft } from "@/lib/generations/draft-types";
import type { Preset } from "@/lib/generations/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Submission = { parentId?: string } & (
  | {
      kind: "image";
      prompt: string;
      aspectRatio: ImageAspectRatio;
      count: number;
      referencePath?: string;
      presetId?: string;
    }
  | {
      kind: "video";
      prompt: string;
      aspectRatio: VideoAspectRatio;
      durationSeconds: VideoDuration;
      startFramePath?: string;
      presetId?: string;
    }
  | { kind: "voice"; prompt: string; voice: VoiceId; style: VoiceStyleId }
);

export type Mode = "image" | "video" | "voice";

type Reference = { path: string | null; previewUrl: string; uploading: boolean; type: string };

type Props = {
  userId: string;
  credits: number;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: (submission: Submission) => void;
  /** Initial settings from "Reuse", "Animate this", "Edit this" or "Add voiceover". */
  draft?: Draft;
  presets: Preset[];
};

const TABS = [
  { id: "image", label: "Image", icon: ImageIcon, ready: true },
  { id: "video", label: "Video", icon: ClapperboardIcon, ready: true },
  { id: "voice", label: "Voice", icon: AudioLinesIcon, ready: true },
  { id: "lipsync", label: "Lip-sync", icon: SmileIcon, ready: false },
] as const;

export function PromptBar({ userId, credits, prompt, onPromptChange, onSubmit, draft, presets }: Props) {
  const draftPreset = presets.find((p) => p.id === draft?.presetId);
  const [imagePreset, setImagePreset] = useState<string | null>(draftPreset?.kind === "image" ? draftPreset.id : null);
  const [videoPreset, setVideoPreset] = useState<string | null>(draftPreset?.kind === "video" ? draftPreset.id : null);
  const [enhancing, setEnhancing] = useState(false);
  // The prompt before the last enhance, while the enhanced text is still untouched.
  const [undoPrompt, setUndoPrompt] = useState<string | null>(null);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  if (undoPrompt !== null && prompt !== enhancedPrompt) {
    // The user edited the enhanced prompt, so Undo would throw their edits away: hide it.
    setUndoPrompt(null);
    setEnhancedPrompt(null);
  }
  const [mode, setMode] = useState<Mode>(draft?.mode ?? "image");
  const [imageRatio, setImageRatio] = useState<ImageAspectRatio>(draft?.image?.aspectRatio ?? "1:1");
  const [videoRatio, setVideoRatio] = useState<VideoAspectRatio>(draft?.video?.aspectRatio ?? "16:9");
  const [count, setCount] = useState(draft?.image?.count ?? 1);
  const [duration, setDuration] = useState<VideoDuration>(draft?.video?.durationSeconds ?? 8);
  const [voice, setVoice] = useState<VoiceId>(draft?.voice?.voice ?? "marin");
  const [style, setStyle] = useState<VoiceStyleId>(draft?.voice?.style ?? "natural");
  const [reference, setReference] = useState<Reference | null>(
    draft?.reference ? { ...draft.reference, uploading: false, type: "image/jpeg" } : null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const allowedTypes: readonly string[] = mode === "video" ? START_FRAME_TYPES : REFERENCE_IMAGE_TYPES;
  const maxLength = mode === "voice" ? MAX_VOICE_CHARACTERS : MAX_PROMPT_LENGTH;
  const cost =
    mode === "video" ? videoCost(duration) : mode === "voice" ? voiceCost(prompt.trim().length) : imageCost(count);
  const notEnoughCredits = credits < cost;
  const tooLong = prompt.length > maxLength;
  const canSubmit =
    prompt.trim().length > 0 && !notEnoughCredits && !tooLong && (mode === "voice" || !reference?.uploading);

  /** Inserts dictated text at the cursor, keeping what's already typed. */
  function insertAtCursor(text: string) {
    const el = textarea.current;
    const start = el?.selectionStart ?? prompt.length;
    const end = el?.selectionEnd ?? prompt.length;
    const before = prompt.slice(0, start);
    const after = prompt.slice(end);
    const spacedText = (before && !/\s$/.test(before) ? " " : "") + text + (after && !/^\s/.test(after) ? " " : "");
    onPromptChange(before + spacedText + after);
    requestAnimationFrame(() => {
      const caret = before.length + spacedText.length;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

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
    if (reference?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(reference.previewUrl);
    setReference(null);
    setFileError(null);
  }

  function submit() {
    if (!canSubmit) return;
    const path = reference?.path ?? undefined;
    const text = prompt.trim();
    const parentId = draft?.parentId;
    onSubmit(
      mode === "voice"
        ? { kind: "voice", prompt: text, voice, style, parentId }
        : mode === "video"
          ? {
              kind: "video",
              prompt: text,
              aspectRatio: videoRatio,
              durationSeconds: duration,
              startFramePath: path,
              parentId,
              presetId: videoPreset ?? undefined,
            }
          : {
              kind: "image",
              prompt: text,
              aspectRatio: imageRatio,
              count,
              referencePath: path,
              parentId,
              presetId: imagePreset ?? undefined,
            },
    );
  }

  async function enhance() {
    const original = prompt;
    setEnhancing(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: mode, prompt: original }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't enhance the prompt. Please try again.");
      onPromptChange(body.prompt);
      setEnhancedPrompt(body.prompt);
      setUndoPrompt(original);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't enhance the prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  function undoEnhance() {
    if (undoPrompt === null) return;
    onPromptChange(undoPrompt);
    setUndoPrompt(null);
    setEnhancedPrompt(null);
  }

  return (
    <div className="rounded-2xl border bg-popover/95 shadow-2xl shadow-black/50 backdrop-blur-md">
      {/* Scrolls sideways within itself on very narrow screens instead of widening the page. */}
      <div
        className="flex items-center gap-0.5 overflow-x-auto border-b px-1.5 pt-2 [scrollbar-width:none] sm:gap-1 sm:px-2"
        role="tablist"
        aria-label="What to create"
      >
        {TABS.map(({ id, label, icon: Icon, ready }) => {
          const tab = (
            <button
              key={id}
              role="tab"
              aria-selected={id === mode}
              aria-disabled={!ready}
              onClick={() => ready && switchMode(id as Mode)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-2 pt-1 pb-2 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:px-3",
                id === mode ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                !ready && "cursor-not-allowed opacity-50",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {!ready && <SoonBadge />}
            </button>
          );
          return ready ? (
            tab
          ) : (
            <Tooltip key={id}>
              <TooltipTrigger asChild>{tab}</TooltipTrigger>
              <TooltipContent className="max-w-60">{COMING_SOON.lipsync}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex gap-3 p-3">
        {reference && mode !== "voice" && (
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
          ref={textarea}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={maxLength}
          rows={2}
          placeholder={
            mode === "voice"
              ? "Type the script to read aloud…"
              : mode === "video"
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
        <DictationButton onText={insertAtCursor} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={mode === "voice" ? "Polish the script" : "Enhance the prompt"}
              disabled={!prompt.trim() || enhancing}
              onClick={enhance}
            >
              {enhancing ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{mode === "voice" ? "Polish the script" : "Enhance the prompt"}</TooltipContent>
        </Tooltip>
        {undoPrompt !== null && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={undoEnhance}>
            <Undo2Icon aria-hidden="true" />
            Undo
          </Button>
        )}

        {mode !== "voice" && (
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
        )}

        {mode === "image" && <PresetPicker kind="image" presets={presets} value={imagePreset} onChange={setImagePreset} />}
        {mode === "video" && <PresetPicker kind="video" presets={presets} value={videoPreset} onChange={setVideoPreset} />}

        {mode === "voice" ? (
          <>
            <VoiceMenu value={voice} onChange={setVoice} />
            <OptionMenu
              label="Style"
              value={style}
              options={VOICE_STYLES.map((s) => ({ value: s.id, label: s.label }))}
              onChange={setStyle}
            />
            <span className={cn("text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
              {prompt.length.toLocaleString()} / {MAX_VOICE_CHARACTERS.toLocaleString()}
            </span>
          </>
        ) : mode === "image" ? (
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

function VoiceMenu({ value, onChange }: { value: VoiceId; onChange: (voice: VoiceId) => void }) {
  const [playing, setPlaying] = useState<VoiceId | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const current = VOICES.find((v) => v.id === value) ?? VOICES[0];

  function preview(id: VoiceId) {
    audio.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    const el = new Audio(`/voices/${id}.mp3`);
    el.onended = () => setPlaying(null);
    el.play().catch(() => setPlaying(null));
    audio.current = el;
    setPlaying(id);
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && (audio.current?.pause(), setPlaying(null))}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Voice: ${current.label}`}>
          <AudioLinesIcon aria-hidden="true" />
          {current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Voice · AI-generated</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as VoiceId)}>
          {VOICES.map((v) => (
            <DropdownMenuRadioItem key={v.id} value={v.id} className="pr-10">
              <span className="flex flex-col">
                <span>{v.label}</span>
                <span className="text-xs text-muted-foreground">{v.description}</span>
              </span>
              <button
                type="button"
                className="absolute right-1.5 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={playing === v.id ? `Stop ${v.label} preview` : `Preview ${v.label}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  preview(v.id);
                }}
              >
                {playing === v.id ? (
                  <SquareIcon className="size-3 fill-current" aria-hidden="true" />
                ) : (
                  <PlayIcon className="size-3.5 fill-current" aria-hidden="true" />
                )}
              </button>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`${label}: ${current?.label}`}>
          {current?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
