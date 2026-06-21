import { useMemo, useState } from "react";
import { CheckSquare, Database, Hash, Image as ImageIcon, List, Loader2, Plus, RefreshCcw, Search, Type } from "lucide-react";
import { ComfyUiLogomark } from "../../components/icons/ComfyUiIcon.jsx";
import { RunningHubLogomark } from "../../components/icons/RunningHubIcon.jsx";
import { localizeRuntimeMessage, useI18n } from "../../i18n/I18nContext.jsx";
import { STEP_KINDS } from "./canvasModel.js";
import { usePaletteDragHandlers } from "./canvasPaletteDrag.js";

function PaletteGroup({ title, icon, items, onAdd, addingRef, bindStepItem, shouldSkipClick, t }) {
  if (!items.length) return null;
  return (
    <div className="canvasPaletteGroup">
      <h4 className="canvasPaletteGroupTitle">{icon}{title}</h4>
      <ul className="canvasPaletteList">
        {items.map(item => (
          <li
            key={`${item.kind}:${item.ref}`}
            draggable={addingRef !== item.ref}
            {...bindStepItem(item)}
          >
            <button
              type="button"
              className="canvasPaletteItem"
              disabled={addingRef === item.ref}
              onClick={() => {
                if (shouldSkipClick()) return;
                onAdd(item);
              }}
              title={t("canvas.palette.addTitle", { name: item.name })}
            >
              <span className="canvasPaletteItemName">{item.name}</span>
              {addingRef === item.ref ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOURCE_BUTTONS = [
  { id: "image", labelKey: "canvas.palette.source.image", icon: ImageIcon },
  { id: "text", labelKey: "canvas.palette.source.text", icon: Type },
  { id: "int", labelKey: "canvas.palette.source.int", icon: Hash },
  { id: "float", labelKey: "canvas.palette.source.float", icon: Hash },
  { id: "boolean", labelKey: "canvas.palette.source.boolean", icon: CheckSquare },
  { id: "menu", labelKey: "canvas.palette.source.menu", icon: List },
  { id: "checkpoint", labelKey: "canvas.palette.source.checkpoint", icon: Database },
  { id: "lora", labelKey: "canvas.palette.source.lora", icon: Database }
];

export function StepPalette({ library, loading, error, onReload, onAddStep, onAddSource, addingRef }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const { bindStepItem, bindSource, shouldSkipClick } = usePaletteDragHandlers();

  const filtered = useMemo(() => {
    const match = (list, kind) => (list || [])
      .map(item => ({ kind, ref: item.id, name: item.name || item.id }))
      .filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()));
    return {
      local: match(library.local, STEP_KINDS.LOCAL),
      rhWf: match(library.rhWf, STEP_KINDS.RH_WF),
      rhApp: match(library.rhApp, STEP_KINDS.RH_APP)
    };
  }, [library, query]);

  return (
    <div className="canvasPaletteContent">
      <div className="canvasPaletteToolbar">
        <div className="canvasPaletteSearch">
          <Search size={13} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t("canvas.palette.search")}
          />
        </div>
        <button type="button" className="canvasNodeBtn" onClick={onReload} title={t("canvas.history.reload")}>
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
        </button>
      </div>

      <p className="canvasPaletteHint">{t("canvas.palette.hint")}</p>

      <div className="canvasPaletteSources">
        {SOURCE_BUTTONS.map(({ id, labelKey, icon: Icon }) => {
          const label = t(labelKey);
          return (
            <button
              key={id}
              type="button"
              className="canvasSourceBtn"
              {...bindSource(id)}
              onClick={() => {
                if (shouldSkipClick()) return;
                onAddSource(id);
              }}
              title={t("canvas.palette.addTitle", { name: label })}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <div className="canvasPaletteScroll">
        {error ? <p className="canvasPaletteError">{localizeRuntimeMessage(error, locale)}</p> : null}
        <PaletteGroup
          title="ComfyUI"
          icon={<ComfyUiLogomark size={13} />}
          items={filtered.local}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
          t={t}
        />
        <PaletteGroup
          title="RunningHub Workflow"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhWf}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
          t={t}
        />
        <PaletteGroup
          title="RunningHub App"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhApp}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
          t={t}
        />
        {!loading && !filtered.local.length && !filtered.rhWf.length && !filtered.rhApp.length ? (
          <p className="canvasPaletteEmpty">{t("canvas.palette.empty")}</p>
        ) : null}
      </div>
    </div>
  );
}
