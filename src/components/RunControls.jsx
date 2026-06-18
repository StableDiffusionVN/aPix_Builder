import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, Square, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function RunControls({
  running,
  canRun,
  canCancel,
  queueCount = 0,
  onRun,
  onCancel,
  onClearQueue,
  onStopAll,
  runLabel,
  compact = false,
  stopInsideRun = false
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const idleLabel = runLabel || "Run";
  const rowClassName = `actionRow ${runLabel ? "rhActionRow" : ""}${compact ? " compactActionRow" : ""}${stopInsideRun ? " runControlSplitRow" : ""}`;
  const hasQueue = queueCount > 0;
  const canClearQueue = Boolean(onClearQueue && hasQueue);
  const canStopAll = Boolean(onStopAll && (canCancel || hasQueue || running));

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menuOpen]);

  const runAction = (handler) => {
    setMenuOpen(false);
    handler?.();
  };

  const runButton = (
    <div className={`runMenuWrap${menuOpen ? " isOpen" : ""}`} ref={menuRef}>
      <button
        type="button"
        className={`runButton${stopInsideRun ? " runControlRun" : ""} ${runLabel ? "rhRunButton" : ""}`}
        onClick={onRun}
        disabled={!canRun}
        title={running ? t("run.queueTitle") : `${idleLabel} (⌘/Ctrl+Enter)`}
      >
        {running ? <Loader2 className="spin" size={compact ? 13 : 15} /> : <Play size={compact ? 13 : 15} />}
        <span>{running ? `${t("run.queue")}${queueCount ? ` (${queueCount})` : ""}` : idleLabel}</span>
      </button>
      <button
        type="button"
        className="runMenuToggle"
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(current => !current);
        }}
        title="Run options"
        aria-label="Run options"
        aria-expanded={menuOpen}
      >
        <ChevronDown size={compact ? 12 : 14} />
      </button>
      {menuOpen ? (
        <div className="runMenu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onCancel)}
            disabled={!canCancel}
          >
            <Square size={13} />
            <span>Stop</span>
          </button>
          {onClearQueue ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onClearQueue)}
              disabled={!canClearQueue}
            >
              <Trash2 size={13} />
              <span>Clear queue</span>
            </button>
          ) : null}
          {onStopAll ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => runAction(onStopAll)}
              disabled={!canStopAll}
            >
              <Square size={13} />
              <span>Stop all</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (stopInsideRun) {
    return (
      <div className={rowClassName}>
        {runButton}
      </div>
    );
  }

  return (
    <div className={rowClassName}>
      {runButton}
    </div>
  );
}
