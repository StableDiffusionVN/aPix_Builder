const STALE_MS = 30_000;

let cache = {
  images: [],
  total: 0,
  fetchedAt: 0
};
let inflight = null;

export function getCachedInputImages() {
  return cache.images;
}

export function setCachedInputImages(images) {
  const list = Array.isArray(images) ? images : [];
  cache = {
    images: list,
    total: list.length,
    fetchedAt: Date.now()
  };
  return list;
}

export function isInputImagesCacheFresh() {
  return cache.images.length > 0 && Date.now() - cache.fetchedAt < STALE_MS;
}

/** Fetch input library with in-flight dedup and short-lived client cache. */
export async function fetchInputImages({ force = false } = {}) {
  if (!force && isInputImagesCacheFresh()) {
    return cache.images;
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetch("/api/input-images?limit=200")
    .then(async (response) => {
      if (!response.ok) return cache.images.length ? cache.images : [];
      const data = await response.json();
      const images = data.images || [];
      setCachedInputImages(images);
      return images;
    })
    .catch(() => (cache.images.length ? cache.images : []))
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
