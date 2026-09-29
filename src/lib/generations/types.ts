export type GenerationKind = "image" | "video" | "voice";
export type GenerationMode = "text" | "edit" | "image_to_video" | "tts";
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed";

/** A generation row as the studio sees it (the columns RLS lets its owner read). */
export type Generation = {
  id: string;
  user_id: string;
  kind: GenerationKind;
  mode: GenerationMode;
  model: string;
  prompt: string;
  final_prompt: string;
  preset_id: string | null;
  params: { aspectRatio?: string; durationSeconds?: number } & Record<string, unknown>;
  input_paths: string[];
  output_paths: string[];
  status: GenerationStatus;
  provider_op_id: string | null;
  error: string | null;
  cost: number;
  refunded: boolean;
  is_public: boolean;
  share_slug: string | null;
  parent_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export const GENERATION_COLUMNS =
  "id, user_id, kind, mode, model, prompt, final_prompt, preset_id, params, input_paths, output_paths, status, provider_op_id, error, cost, refunded, is_public, share_slug, parent_id, created_at, completed_at";
