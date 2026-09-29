import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="29 September 2026">
      <p>By using OneShot you agree to these terms. OneShot is a demo product and is provided as is.</p>

      <h2>Your account</h2>
      <p>You are responsible for activity on your account. One person per account.</p>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use OneShot to create content that:</p>
      <ul>
        <li>is illegal, sexual content involving minors, or promotes violence or hate;</li>
        <li>impersonates a real person or deceives people about who made it;</li>
        <li>infringes someone else&apos;s copyright, trademark or privacy.</li>
      </ul>
      <p>
        Our AI providers also apply their own safety filters, and a request they block is refunded automatically. We
        may remove content or suspend accounts that break these rules.
      </p>

      <h2>What you create</h2>
      <p>
        You own the prompts and uploads you provide and, as far as the law and our providers allow, the results
        generated for you. You give us permission to store and process them to run the product, and to show them
        publicly only if you choose to share them.
      </p>

      <h2>Credits and payments</h2>
      <ul>
        <li>Each generation costs credits, shown before you generate.</li>
        <li>Credits for a generation that fails are refunded to your balance automatically.</li>
        <li>Purchased credits don&apos;t expire and can&apos;t be exchanged for cash.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        OneShot is provided without warranties of any kind. AI output can be inaccurate or unexpected, so review it
        before you rely on it. To the extent the law allows, we aren&apos;t liable for indirect losses from using it.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date above shows when they last changed.</p>
    </LegalPage>
  );
}
