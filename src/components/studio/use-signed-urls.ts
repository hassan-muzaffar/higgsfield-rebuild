"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EXPIRES_IN_SECONDS = 60 * 60;

/** Signed URLs for private files in the `outputs` bucket, fetched in batches as new paths appear. */
export function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const missing = paths.filter((p) => !urls[p]);
  const missingKey = missing.join("|");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    createClient()
      .storage.from("outputs")
      .createSignedUrls(missingKey.split("|"), EXPIRES_IN_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUrls((prev) => {
          const next = { ...prev };
          for (const item of data) if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  return urls;
}
