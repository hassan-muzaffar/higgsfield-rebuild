"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, Loader2Icon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

const ERROR_MESSAGES: Record<string, string> = {
  otp_expired: "That sign-in link has expired or was already used. Send yourself a new one below.",
  access_denied: "Sign-in was cancelled or the link is no longer valid. Please try again.",
  auth_failed: "We couldn't sign you in with that link. It may have been opened in a different browser. Send a new one below.",
};

function errorMessage(code: string) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.auth_failed;
}

type Props = { next?: string; initialError?: string };

export function LoginForm({ next, initialError }: Props) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState(initialError ? errorMessage(initialError) : null);
  const [cooldown, setCooldown] = useState(0);

  // Some auth errors arrive in the URL hash, which the server never sees.
  // Move them into the query string so the page renders the message.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = hash.get("error_code") ?? hash.get("error");
    if (code) {
      const url = new URL(window.location.href);
      url.hash = "";
      url.searchParams.set("error", code);
      window.location.replace(url);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    return url.toString();
  }

  async function signInWithGoogle() {
    setPending("google");
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    // On success the browser is already navigating to Google.
    if (error) {
      setError("Couldn't reach Google sign-in. Please try again.");
      setPending(null);
    }
  }

  async function sendMagicLink(address: string) {
    setPending("email");
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl() },
    });
    setPending(null);
    if (error) {
      setError(
        error.status === 429
          ? "Too many emails sent. Please wait a minute and try again."
          : "Couldn't send the sign-in link. Check the address and try again.",
      );
      return;
    }
    setSentTo(address);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  if (sentTo) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
          <MailIcon className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>. Open it on this
          device to continue.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="secondary"
          className="mt-6 w-full"
          disabled={cooldown > 0 || pending !== null}
          onClick={() => sendMagicLink(sentTo)}
        >
          {pending === "email" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend link"}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setSentTo(null)}>
          <ArrowLeftIcon aria-hidden="true" />
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-2xl shadow-black/40">
      <h1 className="text-center text-xl font-semibold">Sign in to OneShot</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">New here? You get 50 free credits.</p>

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          {error}
        </p>
      )}

      <Button
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        disabled={pending !== null}
        onClick={signInWithGoogle}
      >
        {pending === "google" ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </Button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or
        <Separator className="flex-1" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMagicLink(email.trim());
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending !== null || !email.trim()}>
          {pending === "email" && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Email me a sign-in link
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
