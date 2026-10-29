import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { PRESET_GROUPS, PRESETS } from "../../lib/imageAdjustments.js";
import "../../styles/presetPicker.css";

const IDLE_FINAL_RENDER_MS = 220;

/**
 * Temporary preset preview while hovering the picker. `setPreview(adjustments|null)`
 * stores the override the renderer reads; `render(options)` redraws.
 */
export function usePresetHoverPreview({ buildPreview, setPreview, render }) {
  const frameRef = useRef(0);
  const idleRef = useRef(null);
  const activeRef = useRef(false);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    clearTimeout(idleRef.current);
  }, []);

  return useCallback((preset) => {
    if (!preset && !activeRef.current) return;
    activeRef.current = Boolean(preset);
    setPreview(preset ? buildPreview(preset) : null);
    cancelAnimationFrame(frameRef.current);
    clearTimeout(idleRef.current);
    if (!preset) {
      frameRef.current = requestAnimationFrame(() => render({ interactive: false }));
      return;
    }
    // Fast reduced-size render while sweeping the list, full quality once the pointer rests.
    frameRef.current = requestAnimationFrame(() => render({ interactive: true, forceEmit: true }));
    idleRef.current = setTimeout(() => render({ interactive: false }), IDLE_FINAL_RENDER_MS);
  }, [buildPreview, render, setPreview]);
}

function buildSections(film, customPresets, customLabel) {
  return [
    ...PRESET_GROUPS.map(group => ({ id: group.id, label: group.label, items: PRESETS.filter(item => item.group === group.id) })),
    ...film.groups.map(group => ({ id: group.id, label: group.label, items: film.presets.filter(item => item.group === group.id) })),
    { id: "custom", label: customLabel, items: customPresets }
  ].filter(section => section.items.length);
}

/** Preset dropdown with live preview on hover / arrow keys; click or Enter applies. */
export function PresetPicker({ value, film, customPresets, onApply, onPreview }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("");
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchRef = useRef(null);

  const sections = useMemo(() => {
    const all = buildSections(film, customPresets, t("editor.custom"));
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all
      .map(section => ({ ...section, items: section.items.filter(item => item.name.toLowerCase().includes(needle)) }))
      .filter(section => section.items.length);
  }, [customPresets, film, query, t]);
  const flat = useMemo(() => sections.flatMap(section => section.items), [sections]);
  const current = useMemo(
    () => [...PRESETS, ...film.presets, ...customPresets].find(item => item.id === value) || null,
    [customPresets, film.presets, value]
  );

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
    setQuery("");
    onPreview?.(null);
  }, [onPreview]);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 260 && above > below;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - 8)),
      width: Math.max(rect.width, 240),
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.min(440, Math.max(180, up ? above : below))
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  const placed = Boolean(position);
  useEffect(() => {
    if (open && placed) searchRef.current?.focus();
  }, [open, placed]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (popoverRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [close, open]);

  useEffect(() => {
    if (!open || !placed || !value) return;
    popoverRef.current?.querySelector(`[data-preset-id="${CSS.escape(value)}"]`)?.scrollIntoView({ block: "center" });
  }, [open, placed, value]);

  const preview = useCallback((item) => {
    setHighlight(item?.id || "");
    onPreview?.(item && item.id !== value ? item : null);
  }, [onPreview, value]);

  const choose = useCallback((item) => {
    setOpen(false);
    setPosition(null);
    setQuery("");
    onPreview?.(null);
    onApply(item);
  }, [onApply, onPreview]);

  const onKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!flat.length) return;
      const index = flat.findIndex(item => item.id === highlight);
      const next = flat[(index + (event.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length];
      preview(next);
      popoverRef.current?.querySelector(`[data-preset-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = flat.find(entry => entry.id === highlight) || (flat.length === 1 ? flat[0] : null);
      if (item) choose(item);
    }
  };

  return (
    <div className="field compact presetSelectField">
      <span>{t("editor.selectPreset")}</span>
      <button
        ref={triggerRef}
        type="button"
        className="presetPickerTrigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="presetPickerValue">{current?.name || t("editor.selectPresetPlaceholder")}</span>
        <ChevronDown size={13} />
      </button>
      {open && position ? createPortal(
        <div
          ref={popoverRef}
          className="presetPickerPopover"
          style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
          onKeyDown={onKeyDown}
        >
          <label className="presetPickerSearch">
            <Search size={12} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder={t("editor.presetSearch")}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <div className="presetPickerList" role="listbox" onMouseLeave={() => preview(null)}>
            {sections.map(section => (
              <div key={section.id} className="presetPickerGroup">
                <div className="presetPickerGroupLabel">{section.label}</div>
                {section.items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === value}
                    data-preset-id={item.id}
                    className={`presetPickerItem${item.id === highlight ? " highlighted" : ""}${item.id === value ? " selected" : ""}`}
                    onMouseEnter={() => preview(item)}
                    onFocus={() => preview(item)}
                    onClick={() => choose(item)}
                  >
                    <span>{item.name}</span>
                    {item.id === value ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
            ))}
            {!flat.length ? <p className="presetPickerEmpty">{t("editor.presetSearchEmpty")}</p> : null}
          </div>
          <p className="presetPickerHint">{t("editor.presetHoverHint")}</p>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
