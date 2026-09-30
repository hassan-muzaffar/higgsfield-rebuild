import Link from "next/link";
import { CreditBalance } from "@/components/credit-balance";
import { Logo } from "@/components/logo";
import { MainNav } from "@/components/main-nav";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/profile";

export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      {/* On phones the nav drops to its own row so nothing overflows at 375px. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 px-4 sm:h-14 sm:flex-nowrap sm:gap-x-6">
        <Logo className="h-14" />
        <MainNav className="order-last -mx-1 w-full pb-2 sm:order-none sm:mx-0 sm:w-auto sm:pb-0" />
        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <CreditBalance userId={profile.id} initial={profile.credits} />
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
