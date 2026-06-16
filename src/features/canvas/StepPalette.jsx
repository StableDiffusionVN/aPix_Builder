import { useMemo, useState } from "react";
import { CheckSquare, Database, Hash, Image as ImageIcon, List, Loader2, Plus, RefreshCcw, Search, Type } from "lucide-react";
import { ComfyUiLogomark } from "../../components/icons/ComfyUiIcon.jsx";
import { RunningHubLogomark } from "../../components/icons/RunningHubIcon.jsx";
import { STEP_KINDS } from "./canvasModel.js";
import { usePaletteDragHandlers } from "./canvasPaletteDrag.js";

function PaletteGroup({ title, icon, items, onAdd, addingRef, bindStepItem, shouldSkipClick }) {
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
              title={`${item.name} — kéo thả lên canvas hoặc bấm để thêm`}
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
  { id: "image", label: "Node ảnh", icon: ImageIcon },
  { id: "text", label: "Node text", icon: Type },
  { id: "int", label: "Node int", icon: Hash },
  { id: "float", label: "Node float", icon: Hash },
  { id: "boolean", label: "Node boolean", icon: CheckSquare },
  { id: "menu", label: "Node menu", icon: List },
  { id: "checkpoint", label: "Node checkpoint", icon: Database },
  { id: "lora", label: "Node lora", icon: Database }
];

export function StepPalette({ library, loading, error, onReload, onAddStep, onAddSource, addingRef }) {
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
            placeholder="Tìm template / app…"
          />
        </div>
        <button type="button" className="canvasNodeBtn" onClick={onReload} title="Tải lại">
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCcw size={13} />}
        </button>
      </div>

      <p className="canvasPaletteHint">Kéo node từ thư viện và thả lên canvas để đặt đúng vị trí.</p>

      <div className="canvasPaletteSources">
        {SOURCE_BUTTONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="canvasSourceBtn"
            {...bindSource(id)}
            onClick={() => {
              if (shouldSkipClick()) return;
              onAddSource(id);
            }}
            title={`${label} — kéo thả lên canvas hoặc bấm để thêm`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="canvasPaletteScroll">
        {error ? <p className="canvasPaletteError">{error}</p> : null}
        <PaletteGroup
          title="ComfyUI"
          icon={<ComfyUiLogomark size={13} />}
          items={filtered.local}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
        />
        <PaletteGroup
          title="RunningHub Workflow"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhWf}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
        />
        <PaletteGroup
          title="RunningHub App"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhApp}
          onAdd={onAddStep}
          addingRef={addingRef}
          bindStepItem={bindStepItem}
          shouldSkipClick={shouldSkipClick}
        />
        {!loading && !filtered.local.length && !filtered.rhWf.length && !filtered.rhApp.length ? (
          <p className="canvasPaletteEmpty">Không có template hoặc app nào.</p>
        ) : null}
      </div>
    </div>
  );
}
