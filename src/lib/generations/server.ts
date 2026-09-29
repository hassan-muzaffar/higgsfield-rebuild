import "server-only";
import { MODELS } from "@/lib/ai/models";
import { generateImage, ProviderError } from "@/lib/ai/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_COSTS, type ImageAspectRatio } from "@/lib/generations/config";
import { GENERATION_COLUMNS, type Generation } from "@/lib/generations/types";

export class GenerationRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type NewImageJobs = {
  userId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  count: number;
  referencePath?: string;
  parentId?: string;
};

/** Charges credits and creates the queued image jobs in one transaction. */
export async function createImageJobs(input: NewImageJobs): Promise<Generation[]> {
  const admin = createAdminClient();

  if (input.referencePath) {
    // Only the owner's own uploads may be used as a reference.
    if (!input.referencePath.startsWith(`${input.userId}/`)) {
      throw new GenerationRequestError("That reference image isn't yours.", 403);
    }
    const [folder, name] = splitPath(input.referencePath);
    const { data } = await admin.storage.from("inputs").list(folder, { search: name, limit: 1 });
    if (!data?.some((f) => f.name === name)) {
      throw new GenerationRequestError("The reference image is missing. Please attach it again.", 400);
    }
  }

  const { data, error } = await admin.rpc("create_generations", {
    p_user_id: input.userId,
    p_count: input.count,
    p_kind: "image",
    p_mode: input.referencePath ? "edit" : "text",
    p_model: MODELS.image,
    p_prompt: input.prompt,
    p_final_prompt: input.prompt,
    p_preset_id: null,
    p_params: { aspectRatio: input.aspectRatio },
    p_input_paths: input.referencePath ? [input.referencePath] : [],
    p_cost_each: CREDIT_COSTS.image,
    p_parent_id: input.parentId ?? null,
  });

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new GenerationRequestError("You don't have enough credits for this.", 402);
    }
    if (error.message.includes("rate_limited")) {
      throw new GenerationRequestError("You're creating too fast. Please wait a moment and try again.", 429);
    }
    throw error;
  }
  return data as Generation[];
}

/** Runs one queued image job to completion. Never throws: failures are recorded and refunded. */
export async function runImageJob(id: string) {
  const admin = createAdminClient();

  // Claim the job so it can't run twice.
  const { data: job } = await admin
    .from("generations")
    .update({ status: "running" })
    .eq("id", id)
    .eq("status", "queued")
    .select(GENERATION_COLUMNS)
    .single<Generation>();
  if (!job) return;

  try {
    let reference: { data: Buffer; mimeType: string } | undefined;
    if (job.input_paths[0]) {
      const { data: file, error } = await admin.storage.from("inputs").download(job.input_paths[0]);
      if (error || !file) throw new ProviderError("The reference image couldn't be read. Your credits were refunded.");
      reference = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "image/png" };
    }

    const image = await generateImage({
      prompt: job.final_prompt,
      aspectRatio: job.params.aspectRatio ?? "1:1",
      reference,
    });

    const path = `${job.user_id}/${job.id}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("outputs")
      .upload(path, image.data, { contentType: image.mimeType, upsert: true });
    if (uploadError) throw uploadError;

    await admin
      .from("generations")
      .update({ status: "succeeded", output_paths: [path], completed_at: new Date().toISOString() })
      .eq("id", job.id)
      // If the sweeper already failed and refunded it, leave it failed.
      .eq("status", "running");
  } catch (error) {
    console.error(`[generation ${id}] failed:`, error);
    const message =
      error instanceof ProviderError ? error.userMessage : "Something went wrong. Your credits were refunded.";
    await admin.rpc("fail_generation", { p_generation_id: job.id, p_error: message });
  }
}

function splitPath(path: string) {
  const i = path.lastIndexOf("/");
  return [path.slice(0, i), path.slice(i + 1)] as const;
}
