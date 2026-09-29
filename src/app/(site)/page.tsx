import Link from "next/link";
import { AudioLinesIcon, ClapperboardIcon, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: ImageIcon, title: "Images", text: "Generate from a prompt, or edit any picture by describing the change." },
  { icon: ClapperboardIcon, title: "Video", text: "Turn a prompt or an image into a cinematic clip, with sound." },
  { icon: AudioLinesIcon, title: "Voice", text: "Natural voiceovers from text, and dictate prompts instead of typing." },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 size-[48rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <section className="relative mx-auto max-w-4xl px-4 pt-24 pb-16 text-center sm:pt-32">
        <p className="mx-auto mb-5 w-fit rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          Images · Video · Voice, in one studio
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          One prompt. <span className="text-primary">Finished shot.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Type an idea or say it out loud. Get an image, a video clip or a voiceover, then animate it, edit it, or give
          it a voice.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/create">Start creating, free</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/explore">See what people made</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">50 free credits when you sign up.</p>
      </section>

      <section aria-label="Features" className="relative mx-auto grid max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border bg-card p-6">
            <Icon className="size-5 text-primary" aria-hidden="true" />
            <h2 className="mt-4 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
