import { useEffect, useRef, useState } from "react";
import { Download, FolderOutput, Loader2, Pencil, Plus, Upload, X } from "lucide-react";
import { localizeRuntimeMessage, useI18n } from "../../i18n/I18nContext.jsx";
import { CanvasWorkflowCloseDialog } from "./CanvasWorkflowCloseDialog.jsx";
import { downloadWorkflowFile } from "./workflowFile.js";

export function CanvasWorkflowToolbar({
  placement = "canvas",
  tabs = [],
  activeId,
  isTabUnsavedToLibrary,
  isTabInLibrary,
  needsCloseConfirmation,
  onSwitchTab,
  onRename,
  onNewTab,
  onCloseTab,
  onSaveTabToLibrary,
  onSaveFile,
  onExport,
  onImport
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef(null);
  const renameInputRef = useRef(null);
  const [busyAction, setBusyAction] = useState("");
  const [renameTabId, setRenameTabId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [closingTabId, setClosingTabId] = useState("");
  const [closePrompt, setClosePrompt] = useState(null);
  const [closeDialogBusy, setCloseDialogBusy] = useState(false);

  useEffect(() => {
    if (renameTabId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renameTabId]);

  async function runAction(action, callback) {
    setBusyAction(action);
    try {
      return await callback();
    } catch (error) {
      window.alert(localizeRuntimeMessage(error?.message, locale) || t("canvas.workflow.actionFailed"));
      return null;
    } finally {
      setBusyAction("");
    }
  }

  function startRename() {
    if (busyAction || !activeId) return;
    const activeTab = tabs.find(tab => tab.id === activeId);
    setRenameTabId(activeId);
    setRenameValue(activeTab?.name || "");
  }

  async function commitRename() {
    const nextName = renameValue.trim();
    const tab = tabs.find(item => item.id === renameTabId);
    if (!renameTabId || !nextName || nextName === tab?.name) {
      setRenameTabId("");
      return;
    }
    await runAction("rename", () => onRename(renameTabId, nextName));
    setRenameTabId("");
  }

  function handleRenameKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename();
    } else if (event.key === "Escape") {
      setRenameTabId("");
    }
  }

  async function performCloseTab(tabId, { discardChanges = false } = {}) {
    if (!tabId || closingTabId) return;
    setClosingTabId(tabId);
    try {
      await onCloseTab(tabId, { discardChanges });
      setClosePrompt(current => (current?.tabId === tabId ? null : current));
    } catch (error) {
      window.alert(localizeRuntimeMessage(error?.message, locale) || t("canvas.workflow.closeFailed"));
    } finally {
      setClosingTabId("");
    }
  }

  function handleCloseTabClick(tab, event) {
    event.preventDefault();
    event.stopPropagation();
    if (busyAction || closingTabId || closeDialogBusy) return;
    if (needsCloseConfirmation?.(tab.id)) {
      setClosePrompt({
        tabId: tab.id,
        name: tab.name || "Workflow",
        librarySaved: Boolean(isTabInLibrary?.(tab.id))
      });
      return;
    }
    void performCloseTab(tab.id);
  }

  async function handleSaveAndClose() {
    if (!closePrompt?.tabId) return;
    setCloseDialogBusy(true);
    try {
      await onSaveTabToLibrary(closePrompt.tabId);
      await performCloseTab(closePrompt.tabId);
    } catch (error) {
      window.alert(localizeRuntimeMessage(error?.message, locale) || t("canvas.workflow.saveFailed"));
    } finally {
      setCloseDialogBusy(false);
    }
  }

  function handleExport() {
    try {
      const payload = onExport();
      downloadWorkflowFile(payload, payload.workflow?.name || "Workflow");
    } catch (error) {
      window.alert(localizeRuntimeMessage(error?.message, locale) || t("canvas.workflow.exportFailed"));
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await runAction("import", async () => {
      await onImport(await file.text());
    });
  }

  const disabled = Boolean(busyAction) || closeDialogBusy;
  const activeInLibrary = Boolean(isTabInLibrary?.(activeId));
  const libraryDotClass = activeInLibrary ? "is-library-saved" : "is-library-unsaved";

  return (
    <>
      <section
        className={`canvasWorkflowToolbar nodrag${placement === "topbar" ? " isAppTopBar" : ""}`}
        role="toolbar"
        aria-label={t("canvas.workflow.actions")}
      >
        <input
          ref={inputRef}
          className="canvasWorkflowFileInput"
          type="file"
          aria-hidden="true"
          tabIndex={-1}
          accept=".json,.apix-workflow.json,application/json"
          onChange={handleImport}
        />

        <div className="canvasWorkflowTabs" role="tablist" aria-label={t("canvas.workflow.openTabs")}>
          {tabs.map(tab => {
            const isActive = tab.id === activeId;
            const unsaved = isTabUnsavedToLibrary?.(tab.id);
            const isClosing = closingTabId === tab.id;
            return (
              <div
                key={tab.id}
                role="presentation"
                className={`canvasWorkflowTab${isActive ? " active" : ""}${unsaved ? " unsaved" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="canvasWorkflowTabSelect"
                  title={unsaved ? `${tab.name} (${t("canvas.workflow.unsavedSuffix")})` : tab.name}
                  disabled={disabled || isClosing}
                  onClick={() => {
                    if (tab.id !== activeId) void onSwitchTab(tab.id);
                  }}
                >
                  {renameTabId === tab.id ? (
                    <input
                      ref={renameInputRef}
                      className="canvasWorkflowTabRenameInput nodrag"
                      value={renameValue}
                      aria-label={t("canvas.workflow.renameTab")}
                      disabled={disabled}
                      onClick={event => event.stopPropagation()}
                      onChange={event => setRenameValue(event.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={handleRenameKeyDown}
                    />
                  ) : (
                    <span className="canvasWorkflowTabLabel">{tab.name}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="canvasWorkflowTabClose nodrag nowheel"
                  aria-label={t("canvas.workflow.closeNamed", { name: tab.name })}
                  title={t("canvas.workflow.closeTab")}
                  disabled={disabled || isClosing}
                  onPointerDown={event => event.stopPropagation()}
                  onMouseDown={event => event.stopPropagation()}
                  onClick={event => handleCloseTabClick(tab, event)}
                >
                  {isClosing ? <Loader2 size={11} className="spin" /> : <X size={11} />}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="canvasWorkflowTabNew nodrag nowheel"
            aria-label={t("canvas.workflow.new")}
            title={t("canvas.workflow.newTitle")}
            disabled={disabled}
            onClick={() => runAction("new-tab", onNewTab)}
          >
            {busyAction === "new-tab" ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
          </button>
        </div>

        <button
          type="button"
          className="canvasZoomBtn nodrag nowheel"
          aria-label={t("canvas.workflow.rename")}
          title={t("canvas.workflow.renameTitle")}
          disabled={disabled || !activeId}
          onClick={startRename}
        >
          {busyAction === "rename" ? <Loader2 size={14} className="spin" /> : <Pencil size={14} />}
        </button>

        <span className="canvasZoomDivider" aria-hidden="true" />

        <button
          type="button"
          className="canvasZoomBtn nodrag nowheel"
          aria-label={t("canvas.workflow.import")}
          title={t("canvas.workflow.importTitle")}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {busyAction === "import" ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
        </button>
        <button
          type="button"
          className="canvasZoomBtn nodrag nowheel"
          aria-label={t("canvas.workflow.download")}
          title={t("canvas.workflow.downloadTitle")}
          disabled={disabled}
          onClick={handleExport}
        >
          <Download size={14} />
        </button>
        <button
          type="button"
          className="canvasZoomBtn nodrag nowheel"
          aria-label={t("canvas.workflow.saveToLibrary")}
          title={t("canvas.workflow.saveToLibraryTitle")}
          disabled={disabled}
          onClick={() => runAction("save-file", onSaveFile)}
        >
          {busyAction === "save-file" ? <Loader2 size={14} className="spin" /> : <FolderOutput size={14} />}
        </button>
        <span
          className={`canvasWorkflowSessionDot ${libraryDotClass}`}
          title={
            activeInLibrary
              ? t("canvas.workflow.inLibrary")
              : t("canvas.workflow.notInLibrary")
          }
          aria-hidden="true"
        />
      </section>

      <CanvasWorkflowCloseDialog
        open={Boolean(closePrompt)}
        workflowName={closePrompt?.name || "Workflow"}
        librarySaved={Boolean(closePrompt?.librarySaved)}
        busy={closeDialogBusy || Boolean(closingTabId)}
        onCancel={() => {
          if (!closeDialogBusy && !closingTabId) setClosePrompt(null);
        }}
        onDiscard={() => {
          if (!closePrompt?.tabId || closeDialogBusy) return;
          void performCloseTab(closePrompt.tabId, { discardChanges: true });
        }}
        onSaveAndClose={() => void handleSaveAndClose()}
      />
    </>
  );
}
