import Link from "next/link";
import {
  ArrowRightIcon,
  AudioLinesIcon,
  ClapperboardIcon,
  CoinsIcon,
  ImageIcon,
  MicIcon,
  PaletteIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { VoiceSamples } from "@/components/landing/voice-samples";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS, formatPrice } from "@/lib/billing/packs";
import { CREDIT_COSTS } from "@/lib/generations/config";
import { getProfile } from "@/lib/profile";

// Every sample below was made with OneShot itself (scripts/generate-showcase.mjs).
const GALLERY = [
  { src: "/showcase/ramen.jpg", alt: "A ramen stall on a rainy neon Tokyo street", style: "Neon cyberpunk", ratio: "3 / 4" },
  { src: "/showcase/product.jpg", alt: "A black perfume bottle on wet volcanic rock", style: "Product shot", ratio: "1 / 1" },
  { src: "/showcase/fisherman.jpg", alt: "Portrait of an elderly fisherman in a yellow raincoat", style: "Editorial portrait", ratio: "3 / 4" },
  { src: "/showcase/treehouse.jpg", alt: "A cosy treehouse library with a sleeping cat", style: "Anime", ratio: "3 / 4" },
  { src: "/showcase/teapot.jpg", alt: "A glass teapot shaped like a snail", style: "3D render", ratio: "1 / 1" },
];

const STYLES = ["cinematic", "anime", "product", "film-noir", "watercolor", "3d-render", "editorial", "cyberpunk"];
const STYLE_NAMES: Record<string, string> = {
  cinematic: "Cinematic", anime: "Anime", product: "Product shot", "film-noir": "Film noir",
  watercolor: "Watercolour", "3d-render": "3D render", editorial: "Editorial", cyberpunk: "Neon cyberpunk",
};

export default async function HomePage() {
  const signedIn = Boolean(await getProfile());
  const start = signedIn ? "/create" : "/login?next=/create";

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 size-[48rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-12 text-center sm:pt-24">
        <p className="mx-auto mb-5 w-fit rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          Images · Video · Voice, in one studio
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          One prompt. <span className="text-primary">Finished shot.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Type an idea or say it out loud. Get an image, a cinematic clip with sound, or a voiceover. Then animate it,
          edit it, or give it a voice.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={start}>
              Start creating, free
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/explore">See what people made</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">50 free credits when you sign up. No card needed.</p>

        <figure className="relative mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl border shadow-2xl shadow-black/60">
          <video
            src="/showcase/hero.mp4"
            poster="/showcase/hero.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="An astronaut on a red desert dune under a ringed planet, animated by OneShot"
            className="aspect-video w-full object-cover"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-left text-xs text-white/90 backdrop-blur">
            Made in OneShot: an image in the Cinematic style, animated with the Dolly in camera move.
          </figcaption>
        </figure>
      </section>

      {/* Gallery */}
      <section aria-label="Made with OneShot" className="relative mx-auto max-w-6xl px-4 pb-20">
        <div className="columns-2 gap-3 md:columns-3 lg:columns-5">
          {GALLERY.map((g) => (
            <figure key={g.src} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- static samples, already sized */}
              <img src={g.src} alt={g.alt} loading="lazy" style={{ aspectRatio: g.ratio }} className="w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <figcaption className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white/90">{g.style}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Image */}
      <Feature
        icon={ImageIcon}
        eyebrow="Image"
        title="From a sentence to a finished image"
        text="Describe what you want, pick an aspect ratio and a style, and get up to four takes at once. Attach a photo to edit it just by describing the change."
        points={["5 aspect ratios, up to 4 images at a time", "Edit any image by describing the change", "One-click prompt enhance"]}
        media={
          <div className="grid grid-cols-2 gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample */}
            <img src="/showcase/treehouse.jpg" alt="Anime-style treehouse library" loading="lazy" className="aspect-[3/4] w-full rounded-xl border object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element -- static sample */}
            <img src="/showcase/fisherman.jpg" alt="Editorial portrait of a fisherman" loading="lazy" className="aspect-[3/4] w-full rounded-xl border object-cover" />
          </div>
        }
      />

      {/* Video */}
      <Feature
        reverse
        icon={ClapperboardIcon}
        eyebrow="Video"
        title="Turn any image into a cinematic clip"
        text="Generate video from a prompt, or press Animate this on any image. Choose a camera move and get a 4 to 8 second clip with sound."
        points={["Text-to-video and image-to-video", "Camera moves: dolly, orbit, crane, FPV and more", "Native audio, 16:9 or 9:16"]}
        media={
          <div className="grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- static sample */}
              <img src="/showcase/hero.jpg" alt="The original still image" loading="lazy" className="aspect-video w-full rounded-xl border object-cover" />
              <figcaption className="mt-1.5 text-xs text-muted-foreground">The image</figcaption>
            </figure>
            <figure>
              <video src="/showcase/hero.mp4" poster="/showcase/hero.jpg" autoPlay muted loop playsInline preload="none" aria-label="The same image animated" className="aspect-video w-full rounded-xl border object-cover" />
              <figcaption className="mt-1.5 text-xs text-muted-foreground">After Animate this</figcaption>
            </figure>
          </div>
        }
      />

      {/* Voice */}
      <Feature
        icon={AudioLinesIcon}
        eyebrow="Voice"
        title="Voiceovers that sound human"
        text="Write a script, choose a voice and a speaking style, and get a studio-quality voiceover. Prefer talking to typing? Dictate any prompt with the mic."
        points={["8 voices and 6 speaking styles", "Voice dictation on every tab", "Add a voiceover to anything you've made"]}
        media={
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <MicIcon className="size-4 text-primary" aria-hidden="true" /> Listen to the voices
            </p>
            <VoiceSamples />
            <p className="mt-3 text-xs text-muted-foreground">All voices are AI-generated.</p>
          </div>
        }
      />

      {/* Presets */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm text-primary">
            <PaletteIcon className="size-4" aria-hidden="true" /> Presets
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Presets instead of prompt engineering</h2>
          <p className="mt-3 text-muted-foreground">
            Pick a look or a camera move and OneShot writes the craft into your prompt. Same idea, eight styles:
          </p>
        </div>
        <div className="mt-8 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {STYLES.map((slug) => (
            <figure key={slug}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static thumbnails */}
              <img src={`/presets/${slug}.jpg`} alt={`A fox in the ${STYLE_NAMES[slug]} style`} loading="lazy" className="aspect-square w-full rounded-lg border object-cover" />
              <figcaption className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">{STYLE_NAMES[slug]}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2 text-sm">
          {[
            { icon: WandSparklesIcon, text: "Chain it: Animate this, Edit this, Add voiceover" },
            { icon: SparklesIcon, text: "Enhance turns a few words into a detailed prompt" },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-muted-foreground">
              <Icon className="size-4 text-primary" aria-hidden="true" /> {text}
            </span>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="rounded-3xl border bg-card p-8 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm text-primary">
                <CoinsIcon className="size-4" aria-hidden="true" /> Pricing
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pay only for what you create</h2>
              <p className="mt-3 text-muted-foreground">
                Start with 50 free credits. Top up with a pack when you need more. Credits never expire, and failed
                generations are refunded automatically.
              </p>
              <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
                <li>Image: {CREDIT_COSTS.image} credits</li>
                <li>Video: {CREDIT_COSTS.videoPerSecond} credits per second</li>
                <li>Voiceover: {CREDIT_COSTS.voicePer1000Characters} credits per 1,000 characters</li>
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CREDIT_PACKS.map((p) => (
                <div key={p.id} className="rounded-2xl border bg-background/60 p-4">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="mt-2 text-2xl font-semibold">{formatPrice(p.priceCents)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{p.credits.toLocaleString()} credits</p>
                </div>
              ))}
              <Button asChild variant="secondary" className="sm:col-span-3">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-3xl px-4 pt-8 pb-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Your next shot is one prompt away</h2>
        <Button asChild size="lg" className="mt-8">
          <Link href={start}>
            Start creating, free
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </div>
  );
}

function Feature({
  icon: Icon,
  eyebrow,
  title,
  text,
  points,
  media,
  reverse = false,
}: {
  icon: typeof ImageIcon;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  media: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : undefined}>
        <p className="flex items-center gap-2 text-sm text-primary">
          <Icon className="size-4" aria-hidden="true" /> {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h2>
        <p className="mt-3 text-muted-foreground">{text}</p>
        <ul className="mt-5 space-y-2 text-sm">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>{media}</div>
    </section>
  );
}
