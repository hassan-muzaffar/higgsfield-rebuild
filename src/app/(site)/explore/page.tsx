import type { Metadata } from "next";
import { ExploreFeed } from "@/components/explore/explore-feed";
import { EXPLORE_FILTERS, getExplorePage, type ExploreFilter } from "@/lib/generations/public";

export const metadata: Metadata = {
  title: "Explore",
  description: "Images, videos and voiceovers people made with OneShot. Try any prompt yourself.",
};

export default async function ExplorePage(props: PageProps<"/explore">) {
  const type = (await props.searchParams).type;
  const filter: ExploreFilter = EXPLORE_FILTERS.includes(type as ExploreFilter) ? (type as ExploreFilter) : "all";

  let items: Awaited<ReturnType<typeof getExplorePage>> = [];
  let loadError = false;
  try {
    items = await getExplorePage(filter, 0);
  } catch (error) {
    console.error("[explore] failed to load:", error);
    loadError = true;
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <ExploreFeed key={filter} filter={filter} initialItems={items} loadError={loadError} />
    </div>
  );
}
