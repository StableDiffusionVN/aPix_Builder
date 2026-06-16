import { useMemo, useState } from "react";
import { CheckSquare, Database, Hash, Image as ImageIcon, List, Loader2, Plus, RefreshCcw, Search, Type } from "lucide-react";
import { ComfyUiLogomark } from "../../components/icons/ComfyUiIcon.jsx";
import { RunningHubLogomark } from "../../components/icons/RunningHubIcon.jsx";
import { STEP_KINDS } from "./canvasModel.js";

function PaletteGroup({ title, icon, items, onAdd, addingRef }) {
  if (!items.length) return null;
  return (
    <div className="canvasPaletteGroup">
      <h4 className="canvasPaletteGroupTitle">{icon}{title}</h4>
      <ul className="canvasPaletteList">
        {items.map(item => (
          <li key={`${item.kind}:${item.ref}`}>
            <button
              type="button"
              className="canvasPaletteItem"
              disabled={addingRef === item.ref}
              onClick={() => onAdd(item)}
              title={item.name}
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

export function StepPalette({ library, loading, error, onReload, onAddStep, onAddSource, addingRef }) {
  const [query, setQuery] = useState("");

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

      <div className="canvasPaletteSources">
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("image")}>
          <ImageIcon size={13} /> Node ảnh
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("text")}>
          <Type size={13} /> Node text
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("int")}>
          <Hash size={13} /> Node int
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("float")}>
          <Hash size={13} /> Node float
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("boolean")}>
          <CheckSquare size={13} /> Node boolean
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("menu")}>
          <List size={13} /> Node menu
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("checkpoint")}>
          <Database size={13} /> Node checkpoint
        </button>
        <button type="button" className="canvasSourceBtn" onClick={() => onAddSource("lora")}>
          <Database size={13} /> Node lora
        </button>
      </div>

      <div className="canvasPaletteScroll">
        {error ? <p className="canvasPaletteError">{error}</p> : null}
        <PaletteGroup
          title="ComfyUI"
          icon={<ComfyUiLogomark size={13} />}
          items={filtered.local}
          onAdd={onAddStep}
          addingRef={addingRef}
        />
        <PaletteGroup
          title="RunningHub Workflow"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhWf}
          onAdd={onAddStep}
          addingRef={addingRef}
        />
        <PaletteGroup
          title="RunningHub App"
          icon={<RunningHubLogomark size={11} />}
          items={filtered.rhApp}
          onAdd={onAddStep}
          addingRef={addingRef}
        />
        {!loading && !filtered.local.length && !filtered.rhWf.length && !filtered.rhApp.length ? (
          <p className="canvasPaletteEmpty">Không có template hoặc app nào.</p>
        ) : null}
      </div>
    </div>
  );
}
