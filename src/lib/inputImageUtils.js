export function getInputImageUrl(image) {
  if (!image) return "";
  if (typeof image.url === "string" && image.url.trim()) return image.url.trim();
  if (typeof image.name === "string" && image.name.trim()) {
    return `/api/input-image?name=${encodeURIComponent(image.name.trim())}`;
  }
  return "";
}

export function inferInputImageDate(image) {
  if (image?.createdAt) return new Date(image.createdAt);
  const match = /(\d{13})/.exec(image?.name || "");
  if (match) return new Date(Number(match[1]));
  return null;
}

export function matchesInputImageTimeFilter(value, filter) {
  if (filter === "all") return true;
  const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
  if (!date) return false;
  const now = new Date();
  if (filter === "day") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }
  if (filter === "month") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth();
  }
  if (filter === "year") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

export function filterInputLibraryImages(images, { favoritesOnly = false, favoriteNames, timeFilter = "all" } = {}) {
  const favorites = favoriteNames instanceof Set ? favoriteNames : new Set(favoriteNames || []);
  return (images || []).filter(image => {
    if (favoritesOnly && !favorites.has(image.name)) return false;
    return matchesInputImageTimeFilter(inferInputImageDate(image), timeFilter);
  });
}
