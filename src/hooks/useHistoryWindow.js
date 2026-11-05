import { useEffect, useState } from "react";

// The preference controls rendering in batches, never access to older records.
export function useHistoryWindow(items, batchSize = 100, filterKey = "") {
  const size = Math.min(1000, Math.max(1, Math.floor(Number(batchSize) || 100)));
  const [pages, setPages] = useState(1);
  useEffect(() => { setPages(1); }, [size, filterKey]);
  return {
    items: items.slice(0, size * pages),
    batchSize: size,
    showMore: () => setPages(current => current + 1)
  };
}
