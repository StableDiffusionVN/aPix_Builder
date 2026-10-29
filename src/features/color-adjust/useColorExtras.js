import { useCallback, useEffect, useState } from "react";
import { serializeCubeLut } from "../../../shared/cubeLut.js";
import {
  adjustmentsMatchPreset,
  bakeAdjustmentsLut,
  mergePresetAdjustments,
  normalizeGrading,
  scalePresetAdjustments
} from "../../lib/imageAdjustments.js";
import { ensureLut, forgetLut, subscribeLutStore } from "../../lib/lutStore.js";

/**
 * Colour Grading, LUT library and preset Amount — shared by the output colour
 * panel and the Image Editor modal. Live slider changes go through
 * `setAdjustments`; discrete actions go through `commitAdjustments` (set + history).
 */
export function useColorExtras({ adjustments, setAdjustments, commitAdjustments, allPresets, onLutLoaded }) {
  const [luts, setLuts] = useState([]);
  const [lutError, setLutError] = useState("");
  const [lutBusy, setLutBusy] = useState(false);
  const [amountState, setAmountState] = useState(null);

  const refreshLuts = useCallback(() => {
    fetch("/api/luts")
      .then(response => (response.ok ? response.json() : { luts: [] }))
      .then(data => setLuts(Array.isArray(data?.luts) ? data.luts : []))
      .catch(() => setLuts([]));
  }, []);

  useEffect(() => {
    refreshLuts();
  }, [refreshLuts]);

  const lutId = adjustments?.lut?.id || null;
  useEffect(() => {
    if (!lutId) return undefined;
    const unsubscribe = subscribeLutStore(id => {
      if (id === lutId) onLutLoaded?.();
    });
    ensureLut(lutId);
    return unsubscribe;
  }, [lutId, onLutLoaded]);

  const updateGrading = useCallback((zone, key, value) => {
    setAdjustments(current => {
      const grading = normalizeGrading(current.grading);
      if (zone === "balance") grading.balance = value;
      else grading[zone] = { ...grading[zone], [key]: value };
      return { ...current, grading };
    });
  }, [setAdjustments]);

  const selectLut = useCallback((item) => {
    const lut = item ? { id: item.id, name: item.name, amount: adjustments?.lut?.amount ?? 100 } : null;
    commitAdjustments({ ...adjustments, lut });
  }, [adjustments, commitAdjustments]);

  const updateLutAmount = useCallback((amount) => {
    setAdjustments(current => (current.lut ? { ...current, lut: { ...current.lut, amount } } : current));
  }, [setAdjustments]);

  const importLutFile = useCallback(async (file) => {
    if (!file) return;
    setLutBusy(true);
    setLutError("");
    try {
      const text = await file.text();
      const response = await fetch("/api/luts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name.replace(/\.cube$/i, ""), text })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.lut) throw new Error(data?.error || `HTTP ${response.status}`);
      setLuts(current => [...current, data.lut]);
      commitAdjustments({ ...adjustments, lut: { id: data.lut.id, name: data.lut.name, amount: 100 } });
    } catch (error) {
      setLutError(error?.message || String(error));
    } finally {
      setLutBusy(false);
    }
  }, [adjustments, commitAdjustments]);

  const deleteLut = useCallback(async (id) => {
    await fetch(`/api/luts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    forgetLut(id);
    setLuts(current => current.filter(item => item.id !== id));
    if (adjustments?.lut?.id === id) commitAdjustments({ ...adjustments, lut: null });
  }, [adjustments, commitAdjustments]);

  const exportCube = useCallback((name = "aPix look") => {
    const lut = bakeAdjustmentsLut(adjustments, 33);
    const blob = new Blob([serializeCubeLut({ ...lut, title: name })], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "apix-look"}.cube`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [adjustments]);

  // Amount is shown while the image still equals "preset × amount".
  const amountPreset = amountState ? allPresets.find(item => item.id === amountState.id) : null;
  const presetAmount = amountPreset
    && adjustmentsMatchPreset(adjustments, scalePresetAdjustments(amountPreset.adjustments, amountState.amount))
    ? amountState.amount
    : null;

  const trackPresetApplied = useCallback((preset) => {
    setAmountState(preset?.id ? { id: preset.id, amount: 100 } : null);
  }, []);

  const setPresetAmount = useCallback((amount) => {
    if (!amountPreset) return;
    setAmountState({ id: amountPreset.id, amount });
    setAdjustments(current => mergePresetAdjustments(
      current,
      scalePresetAdjustments(amountPreset.adjustments, amount)
    ));
  }, [amountPreset, setAdjustments]);

  return {
    grading: normalizeGrading(adjustments?.grading),
    updateGrading,
    luts,
    lutError,
    lutBusy,
    selectLut,
    updateLutAmount,
    importLutFile,
    deleteLut,
    exportCube,
    presetAmount,
    amountPresetId: presetAmount !== null ? amountPreset.id : "",
    trackPresetApplied,
    setPresetAmount
  };
}
