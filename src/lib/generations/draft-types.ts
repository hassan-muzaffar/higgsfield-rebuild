import type {
  ImageAspectRatio,
  VideoAspectRatio,
  VideoDuration,
  VoiceId,
  VoiceStyleId,
} from "@/lib/generations/config";

/** A pre-filled prompt bar, from "Reuse", "Animate this", "Edit this" or "Add voiceover". */
export type Draft = {
  /** Changes for every new draft, so the studio re-initialises. */
  nonce: string;
  mode: "image" | "video" | "voice";
  prompt: string;
  /** The generation this one builds on. */
  parentId?: string;
  /** An image already in the user's inputs bucket, with a signed preview URL. */
  reference?: { path: string; previewUrl: string };
  image?: { aspectRatio?: ImageAspectRatio; count?: number };
  video?: { aspectRatio?: VideoAspectRatio; durationSeconds?: VideoDuration };
  voice?: { voice?: VoiceId; style?: VoiceStyleId };
};
