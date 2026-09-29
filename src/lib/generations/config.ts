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

export const CREDIT_COSTS = {
  image: 2, // per image, for both text-to-image and edits
  videoPerSecond: 4,
} as const;

export function imageCost(count: number) {
  return CREDIT_COSTS.image * count;
}

export function videoCost(durationSeconds: number) {
  return CREDIT_COSTS.videoPerSecond * durationSeconds;
}
