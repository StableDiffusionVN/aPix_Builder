import { useMemo, useRef, useState } from "react";
import { createRequiredContext } from "./createRequiredContext.jsx";

const [ColorAdjustContext, useColorAdjustContext] = createRequiredContext("useColorAdjustContext");

export { useColorAdjustContext };

export function ColorAdjustProvider({ children }) {
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const [colorPreviewUrl, setColorPreviewUrl] = useState(null);
  const [colorUpdating, setColorUpdating] = useState(false);
  const [colorPanelWidth, setColorPanelWidth] = useState(0);
  const [healingBridge, setHealingBridge] = useState(null);
  const [colorSyncOpen, setColorSyncOpen] = useState(false);
  const [colorSyncing, setColorSyncing] = useState(false);
  const colorAdjustCacheRef = useRef({});
  const pendingColorSyncSourceRef = useRef(null);
  const [colorAdjustReloadToken, setColorAdjustReloadToken] = useState(0);

  const value = useMemo(() => ({
    colorPanelOpen,
    setColorPanelOpen,
    colorPreviewUrl,
    setColorPreviewUrl,
    colorUpdating,
    setColorUpdating,
    colorPanelWidth,
    setColorPanelWidth,
    healingBridge,
    setHealingBridge,
    colorSyncOpen,
    setColorSyncOpen,
    colorSyncing,
    setColorSyncing,
    colorAdjustCacheRef,
    pendingColorSyncSourceRef,
    colorAdjustReloadToken,
    setColorAdjustReloadToken
  }), [
    colorAdjustReloadToken,
    colorPanelOpen,
    colorPanelWidth,
    colorPreviewUrl,
    colorSyncOpen,
    colorSyncing,
    colorUpdating,
    healingBridge
  ]);

  return <ColorAdjustContext.Provider value={value}>{children}</ColorAdjustContext.Provider>;
}
