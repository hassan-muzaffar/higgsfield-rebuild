import Link from "next/link";
import { CoinsIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { MainNav } from "@/components/main-nav";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/profile";

export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:gap-6">
        <Logo />
        <MainNav />
        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <Button asChild variant="secondary" size="sm" className="gap-1.5 tabular-nums">
                <Link href="/billing" aria-label={`${profile.credits} credits. Buy more`}>
                  <CoinsIcon className="text-primary" aria-hidden="true" />
                  {profile.credits}
                </Link>
              </Button>
              <UserMenu name={profile.display_name} avatarUrl={profile.avatar_url} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login?next=/create">Start creating</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
