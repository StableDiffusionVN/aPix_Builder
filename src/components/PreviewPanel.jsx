import { Suspense } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCompare,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RotateCcw
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { RunningHubRunningState } from "./RunningHubRunningState";
import { RunLogPanel } from "./lazyModals";

export function PreviewPanel({
  outputLabel,
  resultOutputs,
  selectedOutputIndex,
  showStatus,
  error,
  result,
  running,
  status,
  selectedOutput,
  canCompare,
  compareMode,
  setCompareMode,
  resetImageView,
  onOpenEditor,
  onDownload,
  showRunningScreen,
  isRunningHub,
  progress,
  progressPct,
  heroImage,
  displayImage,
  compareInputImage,
  imageScale,
  imagePan,
  imageFitSize,
  outputImageSize,
  outputTimingLabel,
  draggingImage,
  isWheeling,
  comparePosition,
  compareDividerX,
  previewAreaRef,
  imageElementRef,
  handleResultImageLoad,
  handlePreviewWheel,
  handlePreviewPointerDown,
  handlePreviewPointerMove,
  handlePreviewPointerUp,
  stepOutput,
  selectOutput,
  RunningState,
  runLogOpen,
  setRunLogOpen,
  runLogSessions,
  history,
  deleteRunLogSession,
  clearRunLogHistory,
  restoreHistory,
  rhApiKey,
  updateRunLogSession,
  runQueue,
  activeRunId,
  colorPanelOpen,
  onColorPanelToggle,
  colorUpdating,
  colorPanelAlign = "right",
  healingActive = false,
  healingCursor = null,
  healingBrushDiameter = 0,
  handlePreviewPointerLeave
}) {
  const { t } = useI18n();

  const previewImage = displayImage || heroImage;
  const panelOnLeft = colorPanelAlign === "left";
  const colorPanelToggleTitle = `${colorPanelOpen ? t("colorPanel.close") : t("colorPanel.open")} (Tab)`;

  return (
    <section className="previewPanel">
      <div className="panelTitle">
        <h3>{outputLabel}{resultOutputs.length > 1 ? ` (${selectedOutputIndex + 1}/${resultOutputs.length})` : ""}</h3>
        <div className="previewActions">
          {showStatus ? (
            <div className={`status ${error ? "bad" : result ? "good" : ""}`}>
              {error ? <AlertCircle size={17} /> : result ? <CheckCircle2 size={17} /> : running ? <Loader2 className="spin" size={17} /> : <ImageIcon size={17} />}
              <span>{status}</span>
            </div>
          ) : null}
          {selectedOutput ? (
            <>
              {canCompare ? (
                <button
                  className={`downloadButton compareButton ${compareMode ? "active" : ""}`}
                  onClick={() => setCompareMode(current => !current)}
                  title={`${compareMode ? t("preview.disableCompare") : t("preview.enableCompare")} (S)`}
                >
                  <GitCompare size={14} />
                </button>
              ) : null}
              <button className="downloadButton" onClick={resetImageView} title={t("preview.reset")}><RotateCcw size={14} /></button>
              <button className="downloadButton" onClick={onOpenEditor} title={t("preview.editor")}><Pencil size={14} /></button>
              <button className="downloadButton" onClick={() => onDownload(selectedOutput)} title={t("preview.download")}><Download size={14} /></button>
              <button
                type="button"
                className={`downloadButton colorPanelActionButton${colorPanelOpen ? " active" : ""}`}
                onClick={onColorPanelToggle}
                title={colorPanelToggleTitle}
                aria-label={colorPanelToggleTitle}
                aria-expanded={colorPanelOpen}
                disabled={!colorPanelOpen && (!heroImage || showRunningScreen)}
              >
                {colorUpdating ? (
                  <Loader2 size={14} className="spin" />
                ) : panelOnLeft ? (
                  colorPanelOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />
                ) : (
                  colorPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="outputViewer">
        <div
          className={`previewArea ${heroImage && !showRunningScreen ? "isInteractive" : ""} ${resultOutputs.length > 1 ? "hasOutputRail" : ""} ${compareMode ? "isCompareMode" : ""} ${healingActive ? "isHealingTool" : ""} ${draggingImage || isWheeling ? "isDragging" : ""}`}
          ref={previewAreaRef}
          onWheel={handlePreviewWheel}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerUp}
          onPointerCancel={handlePreviewPointerUp}
          onPointerLeave={handlePreviewPointerLeave}
        >
          {healingActive && healingCursor ? (
            <div
              className="brushCursorCircle healingMode"
              style={{
                left: healingCursor.x,
                top: healingCursor.y,
                width: Math.max(4, healingBrushDiameter),
                height: Math.max(4, healingBrushDiameter)
              }}
            />
          ) : null}
          {showRunningScreen ? (
            <div className={`emptyState ${isRunningHub ? "rhEmptyState" : ""}`}>
              {isRunningHub ? (
                <RunningHubRunningState progress={progress} status={status} />
              ) : (
                <RunningState progress={progress} status={status} progressPct={progressPct} />
              )}
            </div>
          ) : heroImage ? (
            <div
              className={`imageStage ${compareMode && canCompare ? "isCompare" : ""}`}
              style={{
                "--image-scale": imageScale,
                "--image-pan-x": `${imagePan.x}px`,
                "--image-pan-y": `${imagePan.y}px`,
                "--image-fit-width": imageFitSize.width ? `${imageFitSize.width}px` : "100%",
                "--image-fit-height": imageFitSize.height ? `${imageFitSize.height}px` : "100%",
                "--compare-position": `${comparePosition}%`,
                "--compare-divider-x": `${compareDividerX}px`
              }}
            >
              {compareMode && canCompare ? (
                <>
                  <img className="resultImage compareInputImage" src={compareInputImage} alt={t("preview.inputImage")} draggable="false" />
                  <img ref={imageElementRef} className="resultImage compareOutputImage" src={previewImage} alt={outputLabel} draggable="false" onLoad={handleResultImageLoad} />
                </>
              ) : (
                <img ref={imageElementRef} className="resultImage" src={previewImage} alt={outputLabel} draggable="false" onLoad={handleResultImageLoad} />
              )}
            </div>
          ) : (
            <div className="emptyState">
              <ImageIcon size={42} />
              <h3>{t("preview.emptyTitle")}</h3>
              <p>{t("preview.emptyBody")}</p>
            </div>
          )}

          {heroImage && resultOutputs.length > 1 ? (
            <>
              <button type="button" className="outputNavButton previous" onClick={event => { event.stopPropagation(); stepOutput(-1); }} title={`${t("preview.previous")} (←)`} aria-label={t("preview.previous")}>
                <ChevronLeft size={20} />
              </button>
              <button type="button" className="outputNavButton next" onClick={event => { event.stopPropagation(); stepOutput(1); }} title={`${t("preview.next")} (→)`} aria-label={t("preview.next")}>
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}

          {heroImage && resultOutputs.length > 1 ? (
            <div className="outputRail" aria-label={t("preview.outputList")}>
              {resultOutputs.map((output, index) => (
                <button
                  type="button"
                  key={`${output.url || output.filename || "output"}-${index}`}
                  className={`outputThumb ${index === selectedOutputIndex ? "active" : ""}`}
                  onClick={() => selectOutput(index)}
                  title={t("preview.viewOutput", { index: index + 1 })}
                  aria-label={t("preview.viewOutput", { index: index + 1 })}
                  aria-pressed={index === selectedOutputIndex}
                >
                  <img src={output.url} alt={output.filename || `Output ${index + 1}`} draggable="false" />
                </button>
              ))}
            </div>
          ) : null}

          {heroImage && compareMode && canCompare ? (
            <div className="compareDivider" style={{ "--compare-divider-x": `${compareDividerX}px` }} aria-hidden="true" />
          ) : null}
          {heroImage && (outputImageSize.width && outputImageSize.height || outputTimingLabel) ? (
            <div className="outputMetaStack">
              {outputImageSize.width && outputImageSize.height ? (
                <div className="outputSizeBadge">{outputImageSize.width} x {outputImageSize.height}</div>
              ) : null}
              {outputTimingLabel ? (
                <div className="outputTimingBadge">{outputTimingLabel}</div>
              ) : null}
            </div>
          ) : null}

          <Suspense fallback={null}>
            <RunLogPanel
              open={runLogOpen}
              onToggle={() => setRunLogOpen(current => !current)}
              sessions={runLogSessions}
              outputHistory={history}
              onDeleteSession={deleteRunLogSession}
              onClearHistory={clearRunLogHistory}
              onRestoreOutput={restoreHistory}
              rhApiKey={rhApiKey}
              onRhTaskInspected={(session, detail) => {
                if (!session?.runId || !detail) return;
                updateRunLogSession(session.runId, {
                  taskId: detail.taskId || session.taskId,
                  rhCoins: detail.rhCoins ?? session.rhCoins
                });
              }}
              runQueue={runQueue}
              activeRunId={activeRunId}
              status={status}
              running={running}
            />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
