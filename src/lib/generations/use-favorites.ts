"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { setFavorite } from "@/lib/generations/client-actions";

/** The user's favourites, toggled optimistically and rolled back if the save fails. */
export function useFavorites(userId: string, initialIds: string[]) {
  const [ids, setIds] = useState(() => new Set(initialIds));

  const isFavorite = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback(
    async (id: string) => {
      const next = !ids.has(id);
      const apply = (on: boolean) =>
        setIds((prev) => {
          const copy = new Set(prev);
          if (on) copy.add(id);
          else copy.delete(id);
          return copy;
        });
      apply(next);
      try {
        await setFavorite(userId, id, next);
      } catch (error) {
        apply(!next);
        toast.error(error instanceof Error ? error.message : "Couldn't update favourites.");
      }
    },
    [ids, userId],
  );

  return { isFavorite, toggle, ids };
}
