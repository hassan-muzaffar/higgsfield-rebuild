# OneShot

**One prompt. Finished shot.** A rebuild of [higgsfield.ai](https://higgsfield.ai): one studio where you type (or say) an idea and get back an image, a cinematic video clip with sound, or a voiceover, then build on it: animate it, edit it, or give it a voice.

Built for the 8x assignment. The product plan, feature list and acceptance criteria are in [`PLAN.md`](PLAN.md). The full AI-agent working log is in [`.agent-logs/`](.agent-logs) (see [`CAPTURE-TEST.md`](CAPTURE-TEST.md)).

## What it does

| | |
|---|---|
| **Create studio** | One prompt bar for Image, Video and Voice. Instant placeholder cards, live progress, results appear by themselves. |
| **Images** | Text-to-image and editing an uploaded image by describing the change. 5 aspect ratios, up to 4 at a time. |
| **Video** | Text-to-video and image-to-video (4, 6 or 8s, 16:9 or 9:16) with native audio. Survives closing the tab mid-generation. |
| **Voice** | Voiceovers with 8 voices and 6 speaking styles (free previews), plus voice dictation of any prompt. |
| **Presets** | 8 image styles and 8 camera moves that write the craft into the prompt, instead of prompt engineering. |
| **Enhance** | One click turns a few words into a detailed prompt, with Undo. |
| **Chaining** | Every result is a starting point: Animate this, Edit this, Add voiceover, Reuse. |
| **Library** | Everything you've made, filterable, with favourites, a detail panel, download and delete. |
| **Sharing & Explore** | Share any result as a public link with a link preview; a public feed where anyone can "Try this prompt". |
| **Credits & billing** | Credits for every generation (cost shown before you click), automatic refunds on failure, credit packs through Stripe Checkout. |
| **Coming soon** | Lip-sync, upscale, voiceover-on-video and teams are visible but clearly labelled, not half-built. |

## Stack and model choices

- **Next.js 16** (App Router, Server Components, route handlers, `after()`), TypeScript, **shadcn/ui** + Tailwind v4.
- **Supabase**: Postgres with row-level security on every table, Auth (Google + email magic link), Storage (private buckets), Realtime, `pg_cron`.
- **One best model per feature** (a model picker adds UI, not quality). All IDs live in [`src/lib/ai/models.ts`](src/lib/ai/models.ts):

| Feature | Model | Why |
|---|---|---|
| Images and edits | Google `gemini-3.1-flash-image` | One model for both generation and editing; fast (~6s) |
| Video | Google `veo-3.1-fast-generate-preview` | Veo 3.1 quality with native audio, cheaper and quicker than standard Veo |
| Voiceover | OpenAI `gpt-4o-mini-tts` | Natural voices plus speaking-style instructions |
| Dictation | OpenAI `gpt-transcribe` | Accepts browser `webm` recordings directly |
| Prompt enhance | Google `gemini-3.5-flash-lite` | Fastest current Gemini text model (~1-3s) |

- **Stripe** Checkout (test mode) for credit packs.

## How it works

### Generation jobs
Every generation, whatever the medium, goes through one job system, so the UI behaves the same everywhere:

1. `POST /api/generate` validates the request, then **one database transaction** charges the credits and creates the job rows (`create_generations`). The response comes back in ~300ms and the card appears immediately.
2. The work runs after the response (`after()`). Images and voice finish in seconds. Video starts a Veo operation and polls it for up to ~5 minutes.
3. The page learns about updates through **Supabase Realtime**, with a 4-second polling fallback. For video, that poll also advances the job, which is how a clip still finishes after the tab was closed or reloaded.
4. Any failure marks the job failed **and refunds it in one transaction** (`fail_generation`). A `pg_cron` sweeper refunds anything stuck (5 min for images and voice, 15 for video), so it works on Vercel's free plan.

### Money and security
- Credits change only inside `security definer` Postgres functions, never from the browser, and every change is written to `credit_ledger`. Tested: 10 parallel spends with credits for one → exactly one succeeds.
- Rate limits: 10 generations per minute (counted on the ledger, so deleting jobs doesn't reset it), 20 enhances and 30 dictations per hour.
- Stripe credits are added **exactly once per Checkout session**, from both the signed webhook and the return to `/billing` (so it works locally without the Stripe CLI). Replays and parallel deliveries are tested.
- RLS on every table; private storage served via short-lived signed URLs; public pages read only from a view without owner ids, costs or inputs. No server secret reaches the browser bundle (checked).

## Running it locally

1. **Install:** `pnpm install` (Node 20+).
2. **Environment:** copy [`.env.example`](.env.example) to `.env.local` and fill in Supabase, Google AI (billing enabled), OpenAI and Stripe **test** keys.
3. **Database:** `supabase link --project-ref <ref>` then `supabase db push` applies everything in [`supabase/migrations`](supabase/migrations) (schema, RLS, functions, presets, cron jobs).
4. **Auth:** in Supabase, enable Google (Client ID and secret from Google Cloud) and add `http://localhost:3000/auth/callback` to the redirect URLs.
5. **Run:** `pnpm dev` → http://localhost:3000.

To test a purchase, use card `4242 4242 4242 4242`, any future date and any CVC.

## Tests

End-to-end scripts drive the real app as signed-in users against the real database, then clean up after themselves. With `pnpm dev` running:

| Script | Checks | Cost |
|---|---|---|
| `pnpm test:db` | 26: RLS between users, credit functions, parallel spending, refunds, rate limit, sweeper, storage policies | free |
| `pnpm test:api` | 9: generate API validation, charging, image jobs, retry | ~$0.08 |
| `pnpm test:library` | 23: library filters, delete, favourites, all four chaining actions | free |
| `pnpm test:presets` | 15: presets applied to jobs, enhance for each medium, limits | ~$0.05 |
| `pnpm test:voice` | 11: voiceover (full-length audio check), dictation | < $0.01 |
| `pnpm test:billing` | 20: Stripe Checkout, signed webhooks, replays, parallel deliveries | free (test mode) |
| `pnpm test:share` | 20: sharing, public pages, Open Graph, Explore, Try this prompt | free |
| `pnpm test:video` | 8: a real 4s Veo clip end to end | ~$0.60 |
| `pnpm showcase` | 9: 6 images → Animate this → image-to-video (also makes the landing samples) | ~$1.15 |

Plus `pnpm lint`, `pnpm typecheck` and `pnpm build`.

## Deploying (Vercel)

1. Import the GitHub repo in Vercel and add the environment variables from `.env.example` (set `NEXT_PUBLIC_APP_URL` to the production URL).
2. In Stripe (test mode), add a webhook endpoint `https://<app>/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and set `STRIPE_WEBHOOK_SECRET` to its signing secret.
3. In Supabase → Auth → URL configuration, set the Site URL to the production URL and add `https://<app>/auth/callback`.
4. In Google Cloud, add the production URL to the OAuth client's JavaScript origins, fill in Branding (homepage, `/privacy`, `/terms`) and publish the app.

## Decisions and trade-offs

- **One model per feature**, chosen for quality and cost, rather than a model picker.
- **Veo 3.1 Fast at 720p** and per-second pricing keep video affordable; prices are in one config file.
- **Camera-move presets preview as animations of the move** rather than real clips, which would have cost ~$5 in generation just for thumbnails.
- **Stripe is fulfilled from two paths** so local development needs no tunnel, while production still relies on the signed webhook.
- **Cut, but labelled "Coming soon"**: lip-sync, upscaling, merging a voiceover into a video, teams.
- **Found while testing and fixed**: Gemini sometimes answers short prompts in text instead of an image (now kept in image mode, retried once, and reported accurately); OpenAI TTS skips word-for-word repeated sentences (test scripts use realistic text and check speaking pace); a Realtime channel could join before the session loaded and miss updates (now subscribes with the user's token, plus polling fallback).
