import { useCallback, useEffect, useState } from "react";

export function useAppUpdate() {
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [upToDate, setUpToDate] = useState(false);
  const desktop = typeof window !== "undefined" ? window.apixDesktop : undefined;
  const isDesktop = Boolean(desktop?.isDesktop);

  useEffect(() => {
    if (!isDesktop || !desktop?.onUpdateAvailable) return undefined;
    return desktop.onUpdateAvailable(payload => {
      setUpdate(payload);
      setCheckError(null);
      setUpToDate(false);
    });
  }, [desktop, isDesktop]);

  const dismissUpdate = useCallback(async () => {
    if (!update?.version) {
      setUpdate(null);
      return;
    }
    if (desktop?.dismissUpdate) {
      await desktop.dismissUpdate(update.version);
    }
    setUpdate(null);
  }, [desktop, update]);

  const downloadUpdate = useCallback(() => {
    if (!update?.downloadUrl || !desktop?.openExternal) return;
    desktop.openExternal(update.downloadUrl);
  }, [desktop, update]);

  const checkForUpdates = useCallback(async () => {
    if (!desktop?.checkForUpdates) return null;
    setChecking(true);
    setCheckError(null);
    setUpToDate(false);
    try {
      const result = await desktop.checkForUpdates();
      if (result?.error) {
        setCheckError(result.error);
        return null;
      }
      if (result) {
        setUpdate(result);
        return result;
      }
      setUpToDate(true);
      return null;
    } finally {
      setChecking(false);
    }
  }, [desktop]);

  return {
    update,
    checking,
    checkError,
    upToDate,
    isDesktop,
    dismissUpdate,
    downloadUpdate,
    checkForUpdates
  };
}
