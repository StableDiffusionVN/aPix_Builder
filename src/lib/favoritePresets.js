import { useSyncExternalStore } from "react";

// Favourite preset ids, shared by every preset picker and kept on this device.
const STORAGE_KEY = "apix.favoritePresets";
const listeners = new Set();

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
  } catch {
    return [];
  }
}

let favorites = read();

export function toggleFavoritePreset(id) {
  favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Storage unavailable (private mode): keep favourites for this session only.
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFavoritePresets() {
  return useSyncExternalStore(subscribe, () => favorites, () => favorites);
}
