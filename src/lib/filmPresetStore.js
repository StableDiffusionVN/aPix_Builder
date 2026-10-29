import { useEffect, useState } from "react";

// Bundled Camera Raw film presets live in their own chunk (≈390 KB) and load on
// first use of a colour editor.
let cache = null;
let pending = null;

export function loadFilmPresets() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import("./presets/filmPresets.data.js")
      .then(module => {
        cache = module.default;
        return cache;
      })
      .catch(error => {
        pending = null;
        console.error("Failed to load film presets", error);
        return { groups: [], presets: [] };
      });
  }
  return pending;
}

const EMPTY = { groups: [], presets: [] };

export function useFilmPresets() {
  const [library, setLibrary] = useState(cache || EMPTY);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    loadFilmPresets().then(result => {
      if (alive) setLibrary(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return library;
}
