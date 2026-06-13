import { useEffect } from "react";
import { DEFAULT_HEALING_BRUSH_SIZE } from "../lib/healingBrush";
import {
  ChevronDown,
  Droplet,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { COLOR_CHANNELS, getCurvePoint, PRESET_GROUPS, PRESETS } from "../lib/imageAdjustments";
import { isTextEntryTarget, preventToolbarFocus } from "../lib/keyboard";
import { ColorPickButton, ColorPickCursorOverlay } from "./colorPickUi";

export { ColorPickButton, ColorPickCursorOverlay } from "./colorPickUi";

export const HealingIcon = ({ size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="7" y="2" width="10" height="20" rx="5" transform="rotate(-45 12 12)" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

export const CurveIcon = ({ size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M3 21h18" />
    <path d="M3 21c4-4 8-16 18-16" />
    <circle cx="3" cy="21" r="1.5" fill="currentColor" />
    <circle cx="21" cy="5" r="1.5" fill="currentColor" />
  </svg>
);

export function AccordionSection({ icon: Icon, title, open, onToggle, children }) {
  return (
    <div className={`imageEditorAccordion ${open ? "isOpen" : ""}`}>
      <button
        type="button"
        className="imageEditorAccordionHeader"
        onMouseDown={preventToolbarFocus}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="imageEditorAccordionTitle"><Icon size={14} /> {title}</span>
        <ChevronDown size={15} className="imageEditorAccordionChevron" />
      </button>
      {open ? <div className="imageEditorAccordionBody">{children}</div> : null}
    </div>
  );
}

export function EditorRange({ label, value, min, max, step = 1, resetValue = 0, onChange, onCommit, onDragStart }) {
  const { t } = useI18n();
  const isDefault = Number(value) === Number(resetValue);
  return (
    <label className="editorRange">
      <span>{label}</span>
      <b>{value}</b>
      <button
        type="button"
        className="editorRangeReset"
        title={t("editor.reset")}
        disabled={isDefault}
        onMouseDown={preventToolbarFocus}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onChange(resetValue);
          onCommit?.();
        }}
      >
        <RotateCcw size={12} />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => onDragStart?.()}
        onChange={event => onChange(Number(event.target.value))}
        onMouseUp={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onTouchEnd={event => {
          onCommit?.();
          event.currentTarget.blur();
        }}
        onBlur={onCommit}
      />
    </label>
  );
}

export function ImageAdjustmentControls({
  engine,
  title,
  resetLabel,
  onReset,
  primaryLabel,
  primaryUpdateText,
  onPrimaryAction,
  primaryDisabled = false,
  primaryLoading = false,
  showHealingTool = false,
  onSyncClick,
  syncDisabled = true,
  syncLoading = false
}) {
  const { t } = useI18n();

  const {
    adjustments,
    hsl,
    error,
    hoveredZone,
    openSections,
    activeColorTab,
    activeCurveChannel,
    selectedCurvePointIndex,
    activePresetId,
    customPresets,
    colorPickTarget,
    toggleColorPickTarget,
    showNewPresetForm,
    newPresetName,
    editingPresetId,
    renameValue,
    histogramCanvasRef,
    curvesCanvasRef,
    updateAdjustment,
    updateHsl,
    applyPreset,
    toggleSection,
    beginSliderDrag,
    commitCurrent,
    isPresetActive,
    handleCreatePreset,
    handleDeletePreset,
    handleUpdatePresetSettings,
    handleSaveRename,
    setShowNewPresetForm,
    setNewPresetName,
    setEditingPresetId,
    setRenameValue,
    setActiveColorTab,
    setActiveCurveChannel,
    setSelectedCurvePointIndex,
    setAdjustments,
    handleHistogramPointerDown,
    handleHistogramPointerMove,
    handleHistogramPointerUp,
    handleHistogramPointerLeave,
    handleCurvesPointerDown,
    handleCurvesPointerMove,
    handleCurvesPointerUp,
    handleCurvesDoubleClick,
    healingActive,
    healingBrushSize,
    updateHealingBrushSize,
    toggleHealingActive,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo
  } = engine;

  useEffect(() => {
    function handleKeyDown(event) {
      const editable = isTextEntryTarget(event.target);
      const hasUndoModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (showHealingTool && hasUndoModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      const hasModifier = hasUndoModifier || event.altKey || event.shiftKey;
      if (editable || hasModifier) return;

      if (event.key === "1") {
        event.preventDefault();
        toggleSection("basic");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        toggleSection("curves");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        toggleSection("hsl");
        return;
      }
      if (event.key === "4") {
        event.preventDefault();
        toggleSection("effects");
        return;
      }
      if (showHealingTool && (event.key === "j" || event.key === "J")) {
        event.preventDefault();
        toggleHealingActive();
        return;
      }
      if (showHealingTool && healingActive && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        const step = event.repeat ? 4 : 1;
        const next = event.key === "["
          ? Math.max(1, healingBrushSize - step)
          : Math.min(180, healingBrushSize + step);
        updateHealingBrushSize(next);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    showHealingTool,
    healingActive,
    healingBrushSize,
    updateHealingBrushSize,
    toggleHealingActive,
    toggleSection,
    handleUndo,
    handleRedo
  ]);

  const replaceHistogramWithHealing = showHealingTool && healingActive && !openSections.presets;
  const showHealingSizeStrip = showHealingTool && healingActive && openSections.presets;
  const selectedCurvePoint = getCurvePoint(adjustments.curves, activeCurveChannel, selectedCurvePointIndex);
  const healingSizeRange = (
    <EditorRange
      label="Size"
      value={healingBrushSize}
      min={1}
      max={180}
      resetValue={DEFAULT_HEALING_BRUSH_SIZE}
      onChange={updateHealingBrushSize}
    />
  );

  return (
    <aside
      className={`imageEditorControls${replaceHistogramWithHealing ? " isHealingFocus" : ""}`}
      onMouseDown={event => {
        if (event.target.closest("button")) preventToolbarFocus(event);
      }}
    >
      <div className="panelTitle colorAdjustPanelTitle">
        <h3>{title}</h3>
        {showHealingTool ? (
          <div className="imageEditorPanelHeaderActions">
            <button
              type="button"
              className="historyIconButton"
              onMouseDown={preventToolbarFocus}
              onClick={handleUndo}
              disabled={!canUndo}
              title={`${t("editor.undo")} (⌘Z)`}
              aria-label={t("editor.undo")}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              className={`historyIconButton colorAdjustHealingButton${healingActive ? " active" : ""}`}
              onMouseDown={preventToolbarFocus}
              onClick={toggleHealingActive}
              title={`${t("editor.healing")} (J)`}
              aria-pressed={healingActive}
              aria-label={t("editor.healing")}
            >
              <HealingIcon size={14} />
            </button>
            <button
              type="button"
              className="historyIconButton"
              onMouseDown={preventToolbarFocus}
              onClick={handleRedo}
              disabled={!canRedo}
              title={`${t("editor.redo")} (⌘⇧Z)`}
              aria-label={t("editor.redo")}
            >
              <Redo2 size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {showHealingSizeStrip ? (
        <div className="colorAdjustHealingTools">{healingSizeRange}</div>
      ) : null}

      {replaceHistogramWithHealing ? (
        <div className="colorAdjustHealingPanel">{healingSizeRange}</div>
      ) : null}

      <div
        className={`editorHistogramWrap${replaceHistogramWithHealing ? " isHidden" : ""}`}
        aria-hidden={replaceHistogramWithHealing}
        onPointerDown={replaceHistogramWithHealing ? undefined : handleHistogramPointerDown}
        onPointerMove={replaceHistogramWithHealing ? undefined : handleHistogramPointerMove}
        onPointerUp={replaceHistogramWithHealing ? undefined : handleHistogramPointerUp}
        onPointerLeave={replaceHistogramWithHealing ? undefined : handleHistogramPointerLeave}
      >
        <canvas ref={histogramCanvasRef} width="240" height="60" className="editorHistogramCanvas" />
        <div className="histogramHoverOverlay">
          <div className={`zoneHover blacks ${hoveredZone === "blacks" ? "active" : ""}`} />
          <div className={`zoneHover shadows ${hoveredZone === "shadows" ? "active" : ""}`} />
          <div className={`zoneHover exposure ${hoveredZone === "luminance" ? "active" : ""}`} />
          <div className={`zoneHover highlights ${hoveredZone === "highlights" ? "active" : ""}`} />
          <div className={`zoneHover whites ${hoveredZone === "whites" ? "active" : ""}`} />
        </div>
        {hoveredZone ? (
          <div className="histogramZoneIndicator">
            <span className="zoneName">
              {hoveredZone === "blacks" && "Blacks"}
              {hoveredZone === "shadows" && "Shadows"}
              {hoveredZone === "luminance" && "Exposure"}
              {hoveredZone === "highlights" && "Highlights"}
              {hoveredZone === "whites" && "Whites"}
            </span>
            <span className="zoneValue">
              {adjustments[hoveredZone] > 0 ? `+${adjustments[hoveredZone]}` : adjustments[hoveredZone]}
            </span>
          </div>
        ) : null}
      </div>

      <div className="accordionListWithSlider">
        <div className="imageEditorAccordionList">
          <AccordionSection icon={Sparkles} title="Presets" open={!!openSections.presets} onToggle={() => toggleSection("presets")}>
            <div className="presetAccordionContent">
              <label className="field compact presetSelectField">
                <span>{t("editor.selectPreset")}</span>
                <select
                  value={activePresetId}
                  onChange={event => {
                    const preset = [...PRESETS, ...customPresets].find(item => item.id === event.target.value);
                    if (preset) applyPreset(preset);
                  }}
                >
                  <option value="">{t("editor.selectPresetPlaceholder")}</option>
                  {PRESET_GROUPS.map(group => {
                    const groupPresets = PRESETS.filter(preset => preset.group === group.id);
                    if (!groupPresets.length) return null;
                    return (
                      <optgroup key={group.id} label={group.label}>
                        {groupPresets.map(preset => (
                          <option key={preset.id} value={preset.id}>{preset.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {customPresets.length > 0 ? (
                    <optgroup label={t("editor.custom")}>
                      {customPresets.map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>

              <div className="presetGroupTitle custom">{t("editor.custom")}</div>
              {customPresets.length === 0 ? (
                <p className="noCustomPresets">{t("editor.noCustomPresets")}</p>
              ) : (
                <div className="customPresetList">
                  {customPresets.map(preset => (
                    <div key={preset.id} className={`customPresetItem ${isPresetActive(preset) ? "active" : ""}`}>
                      {editingPresetId === preset.id ? (
                        <div className="presetRenameWrap">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleSaveRename(preset.id);
                              if (e.key === "Escape") setEditingPresetId(null);
                            }}
                            autoFocus
                            className="presetRenameInput"
                          />
                          <div className="presetRenameActions">
                            <button type="button" className="presetRenameBtn confirm" onClick={() => handleSaveRename(preset.id)}>{t("common.save")}</button>
                            <button type="button" className="presetRenameBtn cancel" onClick={() => setEditingPresetId(null)}>{t("common.cancel")}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="customPresetSelectBtn"
                            onClick={() => applyPreset(preset)}
                          >
                            <span>{preset.name}</span>
                          </button>
                          <div className="customPresetActions">
                            <button
                              type="button"
                              title={t("editor.overwritePreset")}
                              onClick={() => handleUpdatePresetSettings(preset.id)}
                            >
                              <RotateCcw size={11} style={{ transform: "rotate(180deg)" }} />
                            </button>
                            <button
                              type="button"
                              title={t("editor.renamePreset")}
                              onClick={() => {
                                setEditingPresetId(preset.id);
                                setRenameValue(preset.name);
                              }}
                            >
                              <SlidersHorizontal size={11} />
                            </button>
                            <button
                              type="button"
                              className="delete"
                              title={t("editor.deletePreset")}
                              onClick={() => handleDeletePreset(preset.id)}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showNewPresetForm ? (
                <div className="newPresetForm">
                  <input
                    type="text"
                    placeholder={t("editor.newPresetName")}
                    value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleCreatePreset();
                      if (e.key === "Escape") setShowNewPresetForm(false);
                    }}
                    autoFocus
                    className="newPresetInput"
                  />
                  <div className="newPresetFormBtns">
                    <button type="button" className="newPresetBtn cancel" onClick={() => setShowNewPresetForm(false)}>{t("common.cancel")}</button>
                    <button type="button" className="newPresetBtn save" onClick={handleCreatePreset}>{t("editor.savePreset")}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="saveNewPresetBtn" onClick={() => { setShowNewPresetForm(true); setNewPresetName(""); }}>
                  {t("editor.saveNewPreset")}
                </button>
              )}
            </div>
          </AccordionSection>

          <AccordionSection icon={SlidersHorizontal} title="Basic" open={!!openSections.basic} onToggle={() => toggleSection("basic")}>
            <EditorRange label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={value => updateAdjustment("temperature", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Tint" value={adjustments.tint} min={-100} max={100} onChange={value => updateAdjustment("tint", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Exposure" value={adjustments.luminance} min={-100} max={100} onChange={value => updateAdjustment("luminance", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={value => updateAdjustment("contrast", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={value => updateAdjustment("highlights", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={value => updateAdjustment("shadows", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Whites" value={adjustments.whites} min={-100} max={100} onChange={value => updateAdjustment("whites", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Blacks" value={adjustments.blacks} min={-100} max={100} onChange={value => updateAdjustment("blacks", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={value => updateAdjustment("vibrance", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={value => updateAdjustment("saturation", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Hue" value={adjustments.hue} min={-180} max={180} onChange={value => updateAdjustment("hue", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
          </AccordionSection>

          <AccordionSection icon={CurveIcon} title="Curves" open={!!openSections.curves} onToggle={() => toggleSection("curves")}>
            <div className="curvesTabContainer">
              <div className="curvesHeaderRow">
                <div className="curvesTabs">
                  {["rgb", "red", "green", "blue"].map(channel => (
                    <button
                      key={channel}
                      type="button"
                      className={`curvesTabButton ${channel} ${activeCurveChannel === channel ? "active" : ""}`}
                      onClick={() => {
                        setActiveCurveChannel(channel);
                        setSelectedCurvePointIndex(null);
                      }}
                    >
                      {channel === "rgb" ? "RGB" : channel.charAt(0).toUpperCase() + channel.slice(1)}
                    </button>
                  ))}
                </div>
                <ColorPickButton
                  active={colorPickTarget === "curves"}
                  title={t("editor.pickCurveColor")}
                  onClick={() => toggleColorPickTarget("curves")}
                />
              </div>
            </div>

            <div className="curvesCanvasWrapper">
              <canvas
                ref={curvesCanvasRef}
                width={256}
                height={256}
                className="curvesCanvas"
                onPointerDown={handleCurvesPointerDown}
                onPointerMove={handleCurvesPointerMove}
                onPointerUp={handleCurvesPointerUp}
                onPointerCancel={handleCurvesPointerUp}
                onDoubleClick={handleCurvesDoubleClick}
              />
            </div>

            {adjustments.curves ? (
              <div className="curvesControlsRow">
                <div className="curvesPointInfo">
                  {selectedCurvePoint ? (
                    <span>
                      {t("editor.point")}: {selectedCurvePoint.x}, {selectedCurvePoint.y}
                    </span>
                  ) : (
                    <span className="curvesHelpText">{t("editor.addCurvePoint")}</span>
                  )}
                </div>
                <div className="curvesActions">
                  <button
                    type="button"
                    className="curvesActionBtn delete"
                    title={t("editor.deletePoint")}
                    disabled={!selectedCurvePoint || selectedCurvePointIndex === 0 || selectedCurvePointIndex === adjustments.curves[activeCurveChannel].length - 1}
                    onClick={() => {
                      const points = adjustments.curves[activeCurveChannel];
                      if (selectedCurvePointIndex > 0 && selectedCurvePointIndex < points.length - 1) {
                        const nextPoints = points.filter((_, i) => i !== selectedCurvePointIndex);
                        setAdjustments(current => ({
                          ...current,
                          curves: {
                            ...current.curves,
                            [activeCurveChannel]: nextPoints
                          }
                        }));
                        setSelectedCurvePointIndex(null);
                        commitCurrent();
                      }
                    }}
                  >
                    {t("editor.deletePoint")}
                  </button>
                  <button
                    type="button"
                    className="curvesActionBtn reset"
                    title={t("editor.resetCurve")}
                    onClick={() => {
                      setAdjustments(current => ({
                        ...current,
                        curves: {
                          ...current.curves,
                          [activeCurveChannel]: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
                        }
                      }));
                      setSelectedCurvePointIndex(null);
                      commitCurrent();
                    }}
                  >
                    {t("editor.reset")}
                  </button>
                </div>
              </div>
            ) : null}
          </AccordionSection>

          <AccordionSection icon={Droplet} title="Color HSL" open={!!openSections.hsl} onToggle={() => toggleSection("hsl")}>
            <div className="hslHeaderRow">
              <div className="hslSwatches">
                {COLOR_CHANNELS.map(channel => (
                  <button
                    type="button"
                    key={channel.id}
                    className={activeColorTab === channel.id ? "active" : ""}
                    style={{ backgroundColor: channel.color }}
                    onClick={() => setActiveColorTab(channel.id)}
                    title={channel.name}
                  />
                ))}
              </div>
              <ColorPickButton
                active={colorPickTarget === "hsl"}
                title={t("editor.pickHslColor")}
                onClick={() => toggleColorPickTarget("hsl")}
              />
            </div>
            <EditorRange label="Hue" value={hsl.h} min={-180} max={180} onChange={value => updateHsl(activeColorTab, "h", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Saturation" value={hsl.s} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "s", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Luminance" value={hsl.l} min={-100} max={100} onChange={value => updateHsl(activeColorTab, "l", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
          </AccordionSection>

          <AccordionSection icon={Sparkles} title="Effects" open={!!openSections.effects} onToggle={() => toggleSection("effects")}>
            <EditorRange label="Clarity" value={adjustments.clarity} min={-100} max={100} onChange={value => updateAdjustment("clarity", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Texture" value={adjustments.texture} min={-100} max={100} onChange={value => updateAdjustment("texture", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Dehaze" value={adjustments.dehaze} min={-100} max={100} onChange={value => updateAdjustment("dehaze", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Grain" value={adjustments.grain} min={0} max={100} onChange={value => updateAdjustment("grain", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Grain Size" value={adjustments.grainSize ?? 50} min={0} max={100} onChange={value => updateAdjustment("grainSize", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Grain Roughness" value={adjustments.grainRoughness ?? 50} min={0} max={100} onChange={value => updateAdjustment("grainRoughness", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Vignette" value={adjustments.vignette} min={-100} max={100} onChange={value => updateAdjustment("vignette", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
            <EditorRange label="Blur" value={adjustments.blur} min={0} max={20} step={0.5} onChange={value => updateAdjustment("blur", value)} onDragStart={beginSliderDrag} onCommit={commitCurrent} />
          </AccordionSection>
        </div>
      </div>

      {colorPickTarget ? (
        <p className="colorPickHint">{t("editor.pickOnImage")}</p>
      ) : null}

      {error ? <div className="editorError">{error}</div> : null}

      <div className="imageEditorFooter colorAdjustFooter">
        <button type="button" className="colorAdjustFooterButton" onClick={onReset}>
          <span>{resetLabel}</span>
        </button>
        {onSyncClick ? (
          <button
            type="button"
            className="colorAdjustFooterButton"
            onClick={onSyncClick}
            disabled={syncDisabled || syncLoading}
            title={t("colorPanel.sync")}
          >
            <span>{syncLoading ? t("colorPanel.syncing") : t("colorPanel.sync")}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="colorAdjustFooterButton primary"
          onClick={onPrimaryAction}
          disabled={primaryDisabled || primaryLoading}
        >
          <span>{primaryLoading ? primaryUpdateText : primaryLabel}</span>
        </button>
      </div>
    </aside>
  );
}
