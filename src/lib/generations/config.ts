// Shared by the server and the studio UI, so costs and limits are defined once.

export const IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const MAX_IMAGES_PER_REQUEST = 4;
export const MAX_PROMPT_LENGTH = 2000;

export const REFERENCE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

export const VIDEO_DURATIONS = [4, 6, 8] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

// Veo accepts PNG and JPEG start frames.
export const START_FRAME_TYPES = ["image/png", "image/jpeg"] as const;

export const VOICES = [
  { id: "marin", label: "Marin", description: "Warm, natural" },
  { id: "cedar", label: "Cedar", description: "Deep, calm" },
  { id: "coral", label: "Coral", description: "Bright, friendly" },
  { id: "nova", label: "Nova", description: "Clear, upbeat" },
  { id: "sage", label: "Sage", description: "Soft, thoughtful" },
  { id: "ash", label: "Ash", description: "Confident, direct" },
  { id: "onyx", label: "Onyx", description: "Low, authoritative" },
  { id: "verse", label: "Verse", description: "Expressive, dynamic" },
] as const;
export type VoiceId = (typeof VOICES)[number]["id"];
export const VOICE_IDS = VOICES.map((v) => v.id) as [VoiceId, ...VoiceId[]];

export const VOICE_STYLES = [
  { id: "natural", label: "Natural", instructions: "Speak naturally and clearly, at a relaxed pace." },
  { id: "narrator", label: "Narrator", instructions: "Speak like a documentary narrator: measured, rich and engaging." },
  { id: "cheerful", label: "Cheerful", instructions: "Speak in a cheerful, upbeat and friendly tone." },
  { id: "calm", label: "Calm", instructions: "Speak slowly and softly, in a calm, soothing tone." },
  { id: "dramatic", label: "Dramatic", instructions: "Speak like a movie trailer voice: dramatic, with pauses for effect." },
  { id: "ad", label: "Ad read", instructions: "Speak like an energetic radio advert: punchy, persuasive and fast-paced." },
] as const;
export type VoiceStyleId = (typeof VOICE_STYLES)[number]["id"];
export const VOICE_STYLE_IDS = VOICE_STYLES.map((s) => s.id) as [VoiceStyleId, ...VoiceStyleId[]];

export const MAX_VOICE_CHARACTERS = 4000;
export const MAX_DICTATION_SECONDS = 60;

export const CREDIT_COSTS = {
  image: 2, // per image, for both text-to-image and edits
  videoPerSecond: 4,
  voicePer1000Characters: 2,
} as const;

export function voiceCost(characters: number) {
  return CREDIT_COSTS.voicePer1000Characters * Math.max(1, Math.ceil(characters / 1000));
}

export function imageCost(count: number) {
  return CREDIT_COSTS.image * count;
}

export function videoCost(durationSeconds: number) {
  return CREDIT_COSTS.videoPerSecond * durationSeconds;
}
