"use client";

import { useCallback, useEffect, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K | null; dir: SortDir };

/**
 * Sort state that survives a reload, kept per table under its own storage key.
 *
 * Storage is read after mount rather than during render so the server and the
 * first client render agree. `restored` flips once it has been read, for callers
 * that fetch with the sort and would otherwise load twice. A saved key that no
 * longer exists (a column renamed or removed) is dropped for the default.
 */
export function usePersistedSort<K extends string>(
  storageKey: string,
  allowedKeys: readonly K[],
  initial: SortState<K>,
) {
  const [sort, setSortState] = useState<SortState<K>>(initial);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SortState<K>>;
        const key = allowedKeys.includes(saved.key as K) ? (saved.key as K) : null;
        if (key && (saved.dir === "asc" || saved.dir === "desc")) {
          setSortState({ key, dir: saved.dir });
        }
      }
    } catch {
      // Unreadable or blocked storage: keep the default order.
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sort));
    } catch {
      // Private mode and the like: the sort still works, it just is not kept.
    }
  }, [sort, restored, storageKey]);

  const setSort = useCallback(
    (next: SortState<K> | ((prev: SortState<K>) => SortState<K>)) => setSortState(next),
    [],
  );

  return [sort, setSort, restored] as const;
}
