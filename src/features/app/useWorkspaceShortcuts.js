import { useCallback, useEffect, useRef } from "react";
import { isTextEntryTarget, isTypingTarget, releaseGlobalShortcutFocus } from "../../lib/keyboard";

export function isLogToggleKey(event) {
  if (event.code === "Backquote" || event.code === "IntlBackslash") return true;
  return event.key === "`" || event.key === "~";
}

function hasActiveEditorModal() {
  return Boolean(document.querySelector(".imageEditorModal, .maskEditorModal"));
}

function hasBlockingOverlay() {
  return Boolean(document.querySelector(
    ".imageEditorModal, .maskEditorModal, .templateEditorModal, .modalBackdrop"
  ));
}

export function useWorkspaceShortcuts({
  isCanvasView,
  infoOpen,
  setInfoOpen,
  setSettingsOpen,
  setExecutionMode,
  setWorkspaceView,
  setIsFullscreen,
  setRunLogOpen,
  heroImage,
  canCompare,
  resetImageView,
  setCompareMode,
  healingBridgeRef,
  resultOutputsLength,
  stepOutputRef,
  colorPanelOpen,
  showRunningScreen,
  handleColorPanelToggleRef,
  canRun,
  handleRunClickRef
}) {
  useEffect(() => {
    const MODE_BY_CODE = {
      Digit1: "local",
      Digit2: "runninghub-wf",
      Digit3: "runninghub-app"
    };

    function handleExecutionModeShortcut(event) {
      if (!event.altKey) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;

      if (isLogToggleKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        releaseGlobalShortcutFocus(event.target);
        setWorkspaceView(current => (current === "canvas" ? "form" : "canvas"));
        return;
      }

      const mode = MODE_BY_CODE[event.code];
      if (!mode) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      setWorkspaceView("form");
      setExecutionMode(mode);
    }

    window.addEventListener("keydown", handleExecutionModeShortcut, true);
    return () => window.removeEventListener("keydown", handleExecutionModeShortcut, true);
  }, [setExecutionMode, setWorkspaceView]);

  useEffect(() => {
    function handleSettingsShortcut(event) {
      if (event.key !== "," && event.code !== "Comma") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setInfoOpen(false);
      setSettingsOpen(current => !current);
    }
    window.addEventListener("keydown", handleSettingsShortcut, true);
    return () => window.removeEventListener("keydown", handleSettingsShortcut, true);
  }, [setInfoOpen, setSettingsOpen]);

  useEffect(() => {
    function handleInfoShortcut(event) {
      if (event.key === "Escape" && infoOpen) { setInfoOpen(false); return; }
      if (event.key !== "/") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
      setInfoOpen(true);
    }
    window.addEventListener("keydown", handleInfoShortcut, true);
    return () => window.removeEventListener("keydown", handleInfoShortcut, true);
  }, [infoOpen, setInfoOpen, setSettingsOpen]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [setIsFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }, []);

  useEffect(() => {
    function handleFullscreenShortcut(event) {
      if (event.key.toLowerCase() !== "f") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (!event.shiftKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      void toggleFullscreen();
    }
    window.addEventListener("keydown", handleFullscreenShortcut, true);
    return () => window.removeEventListener("keydown", handleFullscreenShortcut, true);
  }, [toggleFullscreen]);

  useEffect(() => {
    function handleLogShortcut(event) {
      if (!isLogToggleKey(event)) return;
      if (event.metaKey || event.altKey) return;
      const bareBacktick = !event.ctrlKey && !event.shiftKey;
      const ctrlBacktick = event.ctrlKey && !event.shiftKey;
      if (!bareBacktick && !ctrlBacktick) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setRunLogOpen(current => !current);
    }
    window.addEventListener("keydown", handleLogShortcut, true);
    return () => window.removeEventListener("keydown", handleLogShortcut, true);
  }, [setRunLogOpen]);

  useEffect(() => {
    function handleSpaceReset(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      if (healingBridgeRef.current?.suspendToolsForSpace?.()) return;
      if (heroImage) resetImageView();
    }
    function handleSpaceKeyUp(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      healingBridgeRef.current?.resumeToolsAfterSpace?.();
    }
    function handleCompareToggle(event) {
      if (!canCompare || event.key.toLowerCase() !== "s") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      setCompareMode(current => !current);
    }
    function preventSpaceClick(event) {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (hasActiveEditorModal()) return;
      if (!heroImage) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
    }
    window.addEventListener("keydown", handleSpaceReset, true);
    window.addEventListener("keydown", handleCompareToggle, true);
    window.addEventListener("keyup", handleSpaceKeyUp, true);
    window.addEventListener("keyup", preventSpaceClick, true);
    return () => {
      window.removeEventListener("keydown", handleSpaceReset, true);
      window.removeEventListener("keydown", handleCompareToggle, true);
      window.removeEventListener("keyup", handleSpaceKeyUp, true);
      window.removeEventListener("keyup", preventSpaceClick, true);
    };
  }, [canCompare, heroImage, resetImageView, setCompareMode, healingBridgeRef]);

  useEffect(() => {
    function handleOutputNavigation(event) {
      if (isCanvasView) return;
      if (!heroImage || resultOutputsLength < 2) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector(".imageEditorModal")) return;
      event.preventDefault();
      event.stopPropagation();
      releaseGlobalShortcutFocus(event.target);
      stepOutputRef.current?.(event.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", handleOutputNavigation, true);
    return () => window.removeEventListener("keydown", handleOutputNavigation, true);
  }, [heroImage, isCanvasView, resultOutputsLength, stepOutputRef]);

  useEffect(() => {
    function handleColorPanelShortcut(event) {
      if (event.key !== "Tab") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (hasBlockingOverlay()) return;
      if (!colorPanelOpen && (!heroImage || showRunningScreen)) return;
      event.preventDefault();
      event.stopPropagation();
      handleColorPanelToggleRef.current?.();
    }
    window.addEventListener("keydown", handleColorPanelShortcut, true);
    return () => window.removeEventListener("keydown", handleColorPanelShortcut, true);
  }, [heroImage, showRunningScreen, colorPanelOpen, handleColorPanelToggleRef]);

  useEffect(() => {
    function handleRunShortcut(event) {
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isCanvasView) return;
      if (hasBlockingOverlay()) return;
      if (!canRun) return;
      event.preventDefault();
      event.stopPropagation();
      handleRunClickRef.current?.();
    }
    window.addEventListener("keydown", handleRunShortcut, true);
    return () => window.removeEventListener("keydown", handleRunShortcut, true);
  }, [canRun, isCanvasView, handleRunClickRef]);

  return { toggleFullscreen };
}

export function useShortcutActionRefs(action) {
  const ref = useRef(action);
  ref.current = action;
  return ref;
}
