import { NextResponse, type NextRequest } from "next/server";
import { EXPLORE_FILTERS, getExplorePage, type ExploreFilter } from "@/lib/generations/public";

/** Public feed pages for infinite scroll. Anyone may call it: it only ever returns shared items. */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  const filter: ExploreFilter = EXPLORE_FILTERS.includes(type as ExploreFilter) ? (type as ExploreFilter) : "all";
  const offset = Math.max(0, Math.min(10_000, Number(request.nextUrl.searchParams.get("offset")) || 0));
  try {
    return NextResponse.json({ items: await getExplorePage(filter, offset) });
  } catch (error) {
    console.error("[explore] failed:", error);
    return NextResponse.json({ error: "Couldn't load more." }, { status: 500 });
  }
}
