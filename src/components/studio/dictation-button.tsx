"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_DICTATION_SECONDS } from "@/lib/generations/config";
import { cn } from "@/lib/utils";

type State = "idle" | "recording" | "transcribing";

// MediaRecorder only exists in the browser; render nothing on the server and in browsers without it.
const noop = () => () => {};
function useCanRecord() {
  return useSyncExternalStore(
    noop,
    () => typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
}

export function DictationButton({ onText }: { onText: (text: string) => void }) {
  const canRecord = useCanRecord();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state === "recording" && seconds >= MAX_DICTATION_SECONDS) recorder.current?.stop();
  }, [state, seconds]);

  // Stop the microphone if the component goes away mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  if (!canRecord) return null;

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      toast.error(
        denied
          ? "Microphone access is blocked. Allow it from the icon in your browser's address bar, then try again."
          : "No microphone found. Check that one is connected.",
      );
      return;
    }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (audio.size < 1000) {
        setState("idle");
        toast.error("That was too short to hear anything. Try again.");
        return;
      }
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", audio);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Dictation failed. Please try again.");
        onText(body.text);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Dictation failed. Please try again.");
      } finally {
        setState("idle");
      }
    };

    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
  }

  const label =
    state === "recording" ? "Stop recording" : state === "transcribing" ? "Transcribing…" : "Dictate with your voice";

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state === "recording" ? "destructive" : "secondary"}
            size="icon-sm"
            aria-label={label}
            aria-pressed={state === "recording"}
            disabled={state === "transcribing"}
            onClick={() => (state === "recording" ? recorder.current?.stop() : start())}
          >
            {state === "recording" ? (
              <SquareIcon className="fill-current" aria-hidden="true" />
            ) : state === "transcribing" ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <MicIcon aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {state === "recording" && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums" role="status">
          <span className={cn("size-2 rounded-full bg-destructive", "animate-pulse")} aria-hidden="true" />
          {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`} / 1:00
        </span>
      )}
    </div>
  );
}
