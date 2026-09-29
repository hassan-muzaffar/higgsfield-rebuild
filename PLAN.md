# Oneshot: Product & Build Plan

A rebuild of [higgsfield.ai](https://higgsfield.ai) (an AI studio for images, video and voice), built for the 8x assignment.

---

## 1. Purpose

### What we are building
**Oneshot** is a web studio where a creator types an idea, or says it out loud, and gets back a finished image, video clip or voiceover. They can then build on the result: edit an image, animate it into a video, or give it a voice, all in the same place.

It rebuilds what makes Higgsfield worth using:
- **One prompt bar for every medium.** Image, video and voice live in one studio, not three tools.
- **Presets instead of prompt engineering.** Pick "Cinematic" or "Dolly-in" rather than writing a paragraph of camera jargon.
- **Chaining.** Every output is a starting point for the next one ("Animate this", "Edit this").
- **Credits and billing.** A real pay-as-you-go product, not a toy demo.

### What we want to achieve
1. **Ship a complete product, not a feature demo.** Someone can land on the site, sign up, create, organise, share and pay without meeting a dead end.
2. **Show product judgement.** One best model per feature instead of a model picker. Features we can't afford yet are clearly marked "Coming soon", not half-built.
3. **UX that feels as good as the original.** Instant feedback, live progress, clear loading, empty and error states, and a polished dark UI that puts the media first.
4. **Production-grade foundations:** secure by default (row-level security, server-only secrets), money handled correctly (atomic credits, idempotent webhooks), and generation jobs that survive slow providers and refreshed tabs.

### Success criteria
- Every acceptance criterion in §6 passes on the deployed Vercel URL.
- A new user can go from landing page → sign up → first image → animate it → buy credits in **under 3 minutes** without help.
- No API key is ever sent to the browser. No user can read or change another user's private data.

### Non-goals (out of scope)
Lip-sync, merging a voiceover into a video, upscaling, teams/workspaces, a model picker, native mobile apps and fine-tuning / custom models. Where users would expect them, they appear in the UI with a **"Coming soon"** label (see F14).

---

## 2. Users & core flows

**Primary user:** a creator or marketer who needs visuals quickly and doesn't want to learn prompting.

**Core flows**
1. **First visit:** Landing → "Start creating" → Sign in (Google / magic link) → Studio, with 50 free credits.
2. **Create:** choose a tab (Image / Video / Voice) → type or dictate a prompt → optionally pick a preset, enhance the prompt or attach a reference → Generate → a placeholder card appears instantly → it fills in live.
3. **Chain:** open a result → "Animate this" → the Video tab opens with the image attached → Generate.
4. **Organise & share:** Library → filter / favourite → make public → copy the share link → it appears in Explore.
5. **Pay:** credits run low → "Buy credits" → Stripe Checkout → back in the app with the new balance.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (latest stable, App Router, Server Components, Route Handlers, `after()`), TypeScript (strict) |
| UI | shadcn/ui, Tailwind CSS, lucide icons, dark-first theme |
| Database | Supabase Postgres, with row-level security on every table |
| Auth | Supabase Auth: Google OAuth and email magic link (`@supabase/ssr`) |
| Storage | Supabase Storage: `inputs` and `outputs` buckets (private, served through signed URLs) |
| Realtime | Supabase Realtime on `generations` for live card updates |
| Images | Google Gemini image model ("Nano Banana" family): text-to-image and image editing |
| Video | Google Veo (latest generally available version): text-to-video and image-to-video, with native audio |
| Voice | OpenAI text-to-speech (voiceover) and OpenAI transcription (dictation) |
| Prompt enhance | Google Gemini text model (fast tier) |
| Payments | Stripe Checkout (one-off credit packs) and webhooks. Test mode for the demo |
| Hosting | Vercel (with Vercel Cron for the stale-job sweeper) |

Exact model IDs live in one file (`lib/ai/models.ts`) and are checked against the providers' docs when each integration is built.

---

## 4. Architecture

### 4.1 Generation job lifecycle
All generations (image, video, voice) go through one job system, so the UI works the same way for every medium.

```
POST /api/generate
  ├─ validate input (zod), sign-in, and whether the preset/tab supports it
  ├─ spend_credits() in one DB transaction  ── not enough credits → 402
  ├─ insert generations row (status = queued)
  ├─ respond 202 { id }  ← the card appears in the UI immediately
  └─ after(): start the job with the provider
        image / voice → result returns in seconds → upload to Storage → succeeded
        video         → save provider operation id → status = running

GET /api/generations/:id   (the client polls this every 5s while a video is running)
  └─ if running and it has an operation id → check the provider → when done, upload → succeeded

On any failure → status = failed, error saved, refund_credits() (every job is refunded at most once)
Vercel Cron (every 5 min) → jobs stuck for more than 15 min → failed + refunded
Supabase Realtime → pushes each row change to the studio and library
```

### 4.2 Data model (Postgres)

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth user), `display_name`, `avatar_url`, `credits int ≥ 0`, `stripe_customer_id` |
| `generations` | `id`, `user_id`, `kind` (image\|video\|voice), `mode` (text\|edit\|image_to_video\|tts), `model`, `prompt`, `final_prompt`, `preset_id`, `params jsonb`, `input_paths[]`, `output_paths[]`, `status` (queued\|running\|succeeded\|failed), `provider_op_id`, `error`, `cost`, `refunded bool`, `is_public`, `share_slug`, `parent_id` (for chaining), `created_at`, `completed_at` |
| `favorites` | `user_id`, `generation_id` (primary key on both) |
| `presets` | `id`, `kind`, `slug`, `name`, `thumbnail_path`, `prompt_template`, `sort` (seeded) |
| `credit_ledger` | `id`, `user_id`, `delta`, `reason` (signup\|generation\|refund\|purchase), `ref_id`, `created_at` |
| `purchases` | `id`, `user_id`, `stripe_session_id` (unique), `pack`, `credits`, `amount_cents`, `status` |
| `stripe_events` | `id` (Stripe event id, primary key), `processed_at`: makes webhook handling idempotent |

- **RLS:** users can read and write only their own rows. `generations` where `is_public = true` can be read by anyone through a narrow view (`public_generations`) that hides private columns.
- **Credits** change only inside the Postgres functions `spend_credits`, `refund_credits` and `grant_credits` (security definer). Every change writes a row to `credit_ledger`. The browser can never write `profiles.credits` directly.
- A trigger on new auth users creates the profile and grants the 50 signup credits.

### 4.3 Credit pricing (initial values, set in one config file)

| Action | Cost |
|---|---|
| Image (per image) | 2 credits |
| Image edit | 2 credits |
| Video (one clip) | 30 credits |
| Voiceover (per 1,000 characters, rounded up) | 2 credits |
| Prompt enhance, dictation | Free, rate-limited |

| Stripe pack (test mode) | Price | Credits |
|---|---|---|
| Starter | $5 | 100 |
| Creator | $15 | 350 |
| Pro | $40 | 1,000 |

### 4.4 Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/pricing` | Credit packs (public) |
| `/login`, `/auth/callback` | Auth |
| `/create` | Studio (main app screen) |
| `/library` | The user's own generations |
| `/explore` | Public community feed |
| `/g/[slug]` | Public share page for one generation |
| `/billing` | Balance, buy credits, purchase history, credit usage |
| `/api/generate`, `/api/generations/[id]` | Job creation and status |
| `/api/enhance`, `/api/transcribe` | Prompt enhance, dictation |
| `/api/stripe/checkout`, `/api/stripe/webhook` | Payments |
| `/api/cron/sweep` | Stale-job sweeper (protected by `CRON_SECRET`) |

### 4.5 Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. All of them except the `NEXT_PUBLIC_*` ones are server-only. `.env.example` is committed; real values never are.

---

## 5. Feature list

Everything in the **Must** list ships. Everything in the **Coming soon** list appears in the UI only as a disabled, labelled entry point.

| # | Feature | Priority |
|---|---|---|
| F1 | Landing page | Must |
| F2 | Authentication | Must |
| F3 | Studio shell & prompt bar | Must |
| F4 | Image generation & editing | Must |
| F5 | Video generation (text & image → video) | Must |
| F6 | Voiceover (text-to-speech) | Must |
| F7 | Voice dictation (speech-to-text) | Must |
| F8 | Presets (image styles, camera moves) | Must |
| F9 | Prompt enhance | Must |
| F10 | Library, detail panel & chaining | Must |
| F11 | Favourites | Must |
| F12 | Sharing & Explore feed | Must |
| F13 | Credits & Stripe billing | Must |
| F14 | "Coming soon" entry points (lip-sync, voiceover-to-video, upscale, teams) | Must (label only) |
| F15 | Cross-cutting quality: responsive, accessible, states, security | Must |

---

## 6. Acceptance criteria

Each item must pass on the deployed app. The format is **Given / When / Then**, or a testable statement.

### F1 Landing page
- [ ] AC1.1 A signed-out visitor to `/` sees a hero section with a headline, a looping sample video or image grid, and a primary **"Start creating"** button.
- [ ] AC1.2 The page has sections for Image, Video, Voice, Presets and Pricing, each with real sample outputs made by the app.
- [ ] AC1.3 "Start creating" goes to `/login` when signed out, or to `/create` when signed in.
- [ ] AC1.4 The page has no horizontal scroll at 375px and scores ≥ 90 for Performance and Accessibility in Lighthouse on desktop.

### F2 Authentication
- [ ] AC2.1 A user can sign in with Google, or with an email magic link, from `/login`.
- [ ] AC2.2 A new user's first sign-in creates a `profiles` row with **50 credits** and a matching `credit_ledger` entry (`reason = signup`).
- [ ] AC2.3 A signed-out user who visits `/create`, `/library` or `/billing` is redirected to `/login` and returned to the page they asked for after signing in.
- [ ] AC2.4 The header shows the user's avatar, with a menu containing Billing and Sign out. Signing out returns to `/`.
- [ ] AC2.5 An invalid or expired magic link shows a friendly error with a button to resend it.

### F3 Studio shell & prompt bar
- [ ] AC3.1 `/create` shows a results feed with a prompt bar fixed at the bottom, which has **Image / Video / Voice** tabs.
- [ ] AC3.2 Each tab shows only its own controls:
  - **Image:** aspect ratio (1:1, 3:4, 4:3, 9:16, 16:9), count (1–4), reference image upload.
  - **Video:** aspect ratio (16:9, 9:16), start-frame image upload.
  - **Voice:** voice picker with a preview button, and a character counter.
- [ ] AC3.3 The Generate button shows the credit cost for the current settings and updates as they change.
- [ ] AC3.4 Generate is disabled when the prompt is empty, or when the balance is too low. In the low-balance case, a **"Buy credits"** link appears.
- [ ] AC3.5 `Enter` submits and `Shift+Enter` adds a new line. The prompt and settings stay in place after submitting, so the user can adjust and run it again.
- [ ] AC3.6 The feed shows the user's recent generations, newest first. When empty, it shows 3 clickable example prompts that fill in the prompt bar.

### F4 Image generation & editing
- [ ] AC4.1 **Given** a text prompt and count N, **when** the user clicks Generate, **then** N placeholder cards appear in the feed within 300 ms, and they are replaced by images when the job succeeds.
- [ ] AC4.2 Output images match the chosen aspect ratio (±2%).
- [ ] AC4.3 **Given** an attached reference image (PNG/JPG/WebP, ≤ 10 MB), the job runs as an **edit** (`mode = edit`), and the result reflects the instruction applied to that image.
- [ ] AC4.4 Files that are too large or of the wrong type are rejected in the browser with an inline message, and never uploaded.
- [ ] AC4.5 Exactly 2 × N credits are deducted when the job is created, and shown in the header straight away.
- [ ] AC4.6 **Given** a provider error or a safety block, the card shows "failed" with a readable reason and a **Retry** button, and the credits are refunded (the balance and a `refund` ledger row both show it).

### F5 Video generation
- [ ] AC5.1 **Given** a text prompt, Generate creates a video job. The card shows a "Generating…" state with elapsed time, and it plays the clip (muted autoplay loop on hover, with controls in the detail panel) when the job finishes.
- [ ] AC5.2 **Given** a start-frame image (uploaded, or via "Animate this"), the job runs as `image_to_video` and the clip starts from that frame.
- [ ] AC5.3 Refreshing the page, or closing and reopening the tab, while a video is generating does **not** lose it. The card comes back in its current state and updates when the job completes.
- [ ] AC5.4 A video job still running after 15 minutes is marked failed by the sweeper and refunded.
- [ ] AC5.5 Videos are saved to Supabase Storage as MP4 and can be downloaded.

### F6 Voiceover (TTS)
- [ ] AC6.1 The Voice tab offers at least 6 voices. Each has a ▶ preview that plays a short sample without spending credits.
- [ ] AC6.2 Text up to 4,000 characters generates an MP3, shown as an audio card with a waveform or progress bar and play/pause.
- [ ] AC6.3 The cost is 2 credits per 1,000 characters (rounded up), shown before generating.

### F7 Voice dictation (STT)
- [ ] AC7.1 A mic button in the prompt bar asks for microphone permission, records, and shows a live recording indicator and timer (60 s maximum).
- [ ] AC7.2 Stopping the recording transcribes it and **inserts** the text at the cursor, without replacing what's already there.
- [ ] AC7.3 If permission is denied, a message explains how to enable it. The mic button is hidden in browsers without MediaRecorder support.

### F8 Presets
- [ ] AC8.1 The Image tab shows at least 8 **style presets** (for example Cinematic, Anime, Product shot, Film noir) as thumbnail cards. The Video tab shows at least 8 **camera-move presets** (for example Dolly in, Orbit, Crane up, FPV, Handheld).
- [ ] AC8.2 Picking a preset shows it as a removable chip in the prompt bar. Generating applies the preset's template to the prompt, and `final_prompt` is saved on the generation.
- [ ] AC8.3 Video preset thumbnails are short looping clips that play on hover.
- [ ] AC8.4 Presets come from the `presets` table, not hard-coded in the UI.

### F9 Prompt enhance
- [ ] AC9.1 A ✨ button rewrites the current prompt into a more detailed one suited to the active tab (image, video or voice), in under 5 s.
- [ ] AC9.2 The enhanced prompt replaces the text in the prompt bar, and **Undo** restores the original.
- [ ] AC9.3 Enhance is free but limited to 20 requests per user per hour. Going over the limit shows a friendly message.

### F10 Library, detail panel & chaining
- [ ] AC10.1 `/library` shows all of the user's generations in a responsive masonry grid, with filters for **All / Images / Videos / Voice / Favourites**, and loads more on scroll (pages of 30).
- [ ] AC10.2 Clicking an item opens a detail panel (a side sheet on desktop, full screen on mobile) showing the media, prompt, preset, settings, model, cost and date.
- [ ] AC10.3 The panel's actions are **Download, Copy prompt, Reuse** (opens the studio with the prompt and settings filled in), **Delete** (after a confirmation dialog, which also removes the files from Storage), **Favourite** and **Share**.
- [ ] AC10.4 Chaining:
  - For an image, **"Animate this"** opens the Video tab with the image as the start frame, and **"Edit this"** opens the Image tab with it as the reference.
  - For any item, **"Add voiceover"** opens the Voice tab with the prompt as the script.
  - The new generation records `parent_id`.
- [ ] AC10.5 The panel can be navigated with ← / → keys and closed with Esc.

### F11 Favourites
- [ ] AC11.1 A heart on each card and in the detail panel toggles the favourite instantly (the UI updates before the server confirms), and the change persists after a reload.
- [ ] AC11.2 The Favourites filter in the library shows only favourited items.

### F12 Sharing & Explore
- [ ] AC12.1 **Share** makes a generation public, gives it a unique `share_slug`, and copies `/g/[slug]` to the clipboard with a toast.
- [ ] AC12.2 `/g/[slug]` works when signed out. It shows the media, prompt and creator's display name, a **"Try this prompt"** button, and Open Graph tags so the link shows a preview when shared.
- [ ] AC12.3 **Make private** removes the item from Explore, and its share link then returns a 404.
- [ ] AC12.4 `/explore` shows public generations from all users in a masonry grid with type filters. **"Try this prompt"** opens the studio with the prompt and preset filled in (after sign-in, if needed).
- [ ] AC12.5 Private generations never appear in Explore or through a share URL, even when requested directly by ID (enforced by RLS and the view).

### F13 Credits & Stripe billing
- [ ] AC13.1 The header always shows the current credit balance, updated live after spending, refunds and purchases.
- [ ] AC13.2 `/pricing` and `/billing` show the three packs. **Buy** opens Stripe Checkout (test mode) for that pack.
- [ ] AC13.3 **Given** a successful payment, **when** the `checkout.session.completed` webhook arrives, **then** exactly the pack's credits are added once, a `purchases` row and a `purchase` ledger row are written, and the user returns to `/billing?success=1` with a success toast.
- [ ] AC13.4 Replaying the same webhook event does **not** add credits a second time (checked with `stripe events resend`).
- [ ] AC13.5 Webhooks with an invalid signature are rejected with a 400 status.
- [ ] AC13.6 Cancelling checkout returns to `/billing` with no change to the balance.
- [ ] AC13.7 `/billing` shows purchase history and a credit usage list from `credit_ledger`.
- [ ] AC13.8 The balance can never go below 0, even with simultaneous Generate requests. Checked by firing 10 requests in parallel with just enough credits for 1: exactly 1 succeeds and the rest return 402.

### F14 "Coming soon" entry points
- [ ] AC14.1 **Lip-sync** and **Voiceover-to-video** appear as disabled tabs or actions with a "Coming soon" badge. **Upscale** appears as a disabled action in the detail panel with the same badge.
- [ ] AC14.2 Hovering or tapping them shows a one-line tooltip explaining the feature. They never call an API or spend credits.

### F15 Cross-cutting quality
- [ ] AC15.1 **Responsive:** every page works from 375px to 1440px, with no horizontal scroll. The prompt bar stays usable when the mobile keyboard is open.
- [ ] AC15.2 **States:** every data view has loading skeletons, an empty state with a clear next step, and an error state with a Retry button.
- [ ] AC15.3 **Accessibility:** everything can be reached with the keyboard with a visible focus ring, icon buttons have `aria-label`s, text contrast meets WCAG AA, and animations respect `prefers-reduced-motion`.
- [ ] AC15.4 **Security:**
  - No server secret appears in the client bundle (checked by grepping the build output).
  - All `/api` routes except the webhook, cron and public share lookups require a session.
  - RLS is enabled on every table, and a second test user cannot read, update or delete the first user's private generations or files.
- [ ] AC15.5 **Validation and limits:** every API input is validated with zod. Generation is rate-limited to 10 requests per minute per user.
- [ ] AC15.6 **Feedback:** each action (generate, delete, share, favourite, purchase) gives visible feedback within 300 ms (an optimistic update, a toast or a spinner).
- [ ] AC15.7 **Quality gates:** `pnpm build`, `pnpm lint` and `pnpm typecheck` pass with no errors. The app is deployed to Vercel, and the README covers setup, env vars, architecture and the decisions we made.

---

## 7. UX principles
1. **The prompt bar is home.** Every feature is reached from it or leads back to it.
2. **Never make the user wait blind.** Placeholder cards appear instantly, show live status and elapsed time, and survive a page reload.
3. **Every output is an input.** Chaining actions sit on every result.
4. **Show the cost before the click.** Credits are always visible, with no surprises.
5. **Media first.** Dark neutral surfaces, minimal chrome, big previews, one accent colour.

---

## 8. Milestones
Each milestone ends deployed and demoable.

| # | Milestone | Features | Exit check |
|---|---|---|---|
| M1 | Foundations | Scaffold, theme, Supabase schema + RLS + credit functions, F2, app shell | Sign in and see 50 credits |
| M2 | Image pipeline | Job system, F3, F4 | AC3.x, AC4.x pass |
| M3 | Video | F5, sweeper cron | AC5.x pass, including refreshing mid-job |
| M4 | Voice | F6, F7 | AC6.x, AC7.x pass |
| M5 | Library & chaining | F10, F11 | AC10.x, AC11.x pass |
| M6 | Creative boosters | F8 (seed presets and thumbnails), F9 | AC8.x, AC9.x pass |
| M7 | Money | F13 | AC13.x pass, including replaying webhooks and parallel spending |
| M8 | Community | F12 | AC12.x pass |
| M9 | Front door & polish | F1, F14, F15, README | Every AC in §6 passes on production |

The core product (create, see and reuse) works end to end by M5. After that, each milestone adds a feature without reworking earlier ones.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Veo is slow and expensive | Credits price it at 30. Jobs run in the background with polling. A sweeper refunds stuck jobs. During development we use as few video runs as possible. |
| Serverless time limits | Image and voice jobs run in `after()`. Video uses long-running operation polling, so no single request waits more than about 60 s. |
| Provider model IDs or APIs change | All IDs live in `lib/ai/models.ts`, and each provider sits behind a small adapter with the same interface. |
| Public demo abuse | Signup grant capped at 50 credits, per-user rate limits, a 4,000-character limit on voice text, and file size and type checks. |
| Credit bugs lose money | Credit changes only happen through atomic database functions, with a ledger of every change, idempotent webhooks, and the parallel-spend test (AC13.8). |
| Safety blocks look like bugs | Blocks are shown as a clear "Blocked by safety filter" message with an automatic refund. |
