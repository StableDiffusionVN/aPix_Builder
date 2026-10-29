import { parseCubeLut } from "../../shared/cubeLut.js";

// Parsed .cube LUTs by id. The colour pipeline reads synchronously from here;
// adjustments only carry `lut: { id, name, amount }` so history/presets stay small.
const loaded = new Map();
const pending = new Map();
const listeners = new Set();

export function getLoadedLut(id) {
  return id ? loaded.get(id) || null : null;
}

export function setLoadedLut(id, lut) {
  loaded.set(id, lut);
  for (const listener of listeners) listener(id);
}

export function forgetLut(id) {
  loaded.delete(id);
}

export function subscribeLutStore(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ensureLut(id) {
  if (!id) return Promise.resolve(null);
  if (loaded.has(id)) return Promise.resolve(loaded.get(id));
  if (pending.has(id)) return pending.get(id);
  const request = fetch(`/api/luts/${encodeURIComponent(id)}`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then(text => {
      const lut = parseCubeLut(text);
      setLoadedLut(id, lut);
      return lut;
    })
    .catch(error => {
      console.error("Failed to load LUT", id, error);
      return null;
    })
    .finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

/** Resolve every LUT an adjustments object needs (call before off-screen renders). */
export function ensureLutsFor(adjustments) {
  return ensureLut(adjustments?.lut?.id);
}
