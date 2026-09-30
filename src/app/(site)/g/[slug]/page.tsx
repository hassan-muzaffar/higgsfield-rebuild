import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AudioLinesIcon, SparklesIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicGeneration } from "@/lib/generations/public";

const KIND_LABEL = { image: "Image", video: "Video", voice: "Voiceover" } as const;

function title(prompt: string) {
  return prompt.length > 60 ? `${prompt.slice(0, 57).trimEnd()}…` : prompt;
}

export async function generateMetadata(props: PageProps<"/g/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  // Link previews are fetched once and cached by the chat app, so a week-long URL is plenty.
  const g = await getPublicGeneration(slug, 60 * 60 * 24 * 7);
  if (!g) return { title: "Not found" };
  const description = `${KIND_LABEL[g.kind]} made with OneShot${g.creator_name ? ` by ${g.creator_name}` : ""}.`;
  return {
    title: title(g.prompt),
    description,
    openGraph: {
      title: title(g.prompt),
      description,
      type: g.kind === "video" ? "video.other" : "website",
      images: g.kind === "image" && g.mediaUrl ? [{ url: g.mediaUrl }] : undefined,
      videos: g.kind === "video" && g.mediaUrl ? [{ url: g.mediaUrl, type: "video/mp4" }] : undefined,
      audio: g.kind === "voice" && g.mediaUrl ? [{ url: g.mediaUrl, type: "audio/mpeg" }] : undefined,
    },
    twitter: { card: g.kind === "image" ? "summary_large_image" : "summary", title: title(g.prompt), description },
  };
}

export default async function SharedPage(props: PageProps<"/g/[slug]">) {
  const { slug } = await props.params;
  const g = await getPublicGeneration(slug);
  if (!g) notFound();

  const initial = (g.creator_name?.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="overflow-hidden rounded-2xl border bg-black/40">
        {!g.mediaUrl ? (
          <div className="aspect-video animate-pulse bg-muted" />
        ) : g.kind === "video" ? (
          <video src={g.mediaUrl} controls autoPlay muted loop playsInline className="mx-auto max-h-[70vh] w-full object-contain" />
        ) : g.kind === "voice" ? (
          <div className="flex flex-col items-center gap-5 px-6 py-14">
            <div className="grid size-16 place-items-center rounded-full bg-primary/15">
              <AudioLinesIcon className="size-7 text-primary" aria-hidden="true" />
            </div>
            <audio src={g.mediaUrl} controls className="w-full max-w-lg" />
            <p className="text-xs text-muted-foreground">AI-generated voice</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={g.mediaUrl} alt={g.prompt} className="mx-auto max-h-[70vh] w-full object-contain" />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="size-6">
              {g.creator_avatar_url && <AvatarImage src={g.creator_avatar_url} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
            </Avatar>
            <span>{g.creator_name ?? "A OneShot creator"}</span>
            <Badge variant="secondary">{KIND_LABEL[g.kind]}</Badge>
          </div>
          <h1 className="mt-3 text-lg leading-relaxed text-pretty">{g.prompt}</h1>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-48">
          <Button asChild>
            <Link href={`/create?try=${g.share_slug}`}>
              <SparklesIcon aria-hidden="true" />
              Try this prompt
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/explore">Explore more</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
