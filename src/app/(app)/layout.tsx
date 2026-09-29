import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getProfile } from "@/lib/profile";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy already redirects signed-out users; this guards against a stale session.
  if (!(await getProfile())) redirect("/login");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8">{children}</main>
    </>
  );
}
