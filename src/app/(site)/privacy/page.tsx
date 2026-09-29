import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

const CONTACT_URL = "https://github.com/hassan-muzaffar/higgsfield-rebuild/issues";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="29 September 2026">
      <p>
        OneShot is a demo product that turns prompts into images, video and voiceovers. This page explains what we
        collect, why, and who processes it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, and your name and profile picture if you sign in with
          Google.
        </li>
        <li>
          <strong>What you create:</strong> your prompts, the settings you choose, images you upload, and the images,
          videos and audio we generate for you.
        </li>
        <li>
          <strong>Voice dictation:</strong> audio you record is sent for transcription and is not stored.
        </li>
        <li>
          <strong>Payments:</strong> handled by Stripe. We never see or store your card details, only a record of
          what you bought.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run the product: to sign you in, generate and store your creations, keep your credit balance, and
        process payments. We don&apos;t sell your data or use it for advertising.
      </p>

      <h2>Who processes it</h2>
      <ul>
        <li>Supabase: database, sign-in and file storage.</li>
        <li>Google (Gemini and Veo): image and video generation, and prompt enhancement.</li>
        <li>OpenAI: voiceover and speech-to-text.</li>
        <li>Stripe: payments.</li>
        <li>Vercel: hosting.</li>
      </ul>
      <p>Prompts and uploads are sent to these providers only to produce the result you asked for.</p>

      <h2>What others can see</h2>
      <p>
        Your creations are private by default. If you share one, its media, prompt and your display name become
        visible to anyone with the link and in the public Explore feed, until you make it private again.
      </p>

      <h2>Your choices</h2>
      <p>
        You can delete any creation from your library at any time, which also deletes its files. To delete your
        account and all of its data, <a href={CONTACT_URL}>contact us</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? <a href={CONTACT_URL}>Open an issue on our GitHub repository</a>.
      </p>
    </LegalPage>
  );
}
