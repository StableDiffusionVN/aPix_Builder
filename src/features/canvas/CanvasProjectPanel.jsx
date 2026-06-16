import { useState } from "react";
import { FolderPlus, Loader2, Pencil, Trash2 } from "lucide-react";

function formatUpdatedAt(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

export function CanvasProjectPanel({
  projects,
  activeId,
  activeName,
  onSwitch,
  onCreate,
  onRename,
  onDelete
}) {
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  async function handleCreate() {
    const name = window.prompt("Tên project mới:", "Project mới");
    if (!name?.trim()) return;
    setCreating(true);
    try {
      await onCreate(name.trim());
    } finally {
      setCreating(false);
    }
  }

  async function handleSwitch(id) {
    if (id === activeId) return;
    setBusyId(id);
    try {
      await onSwitch(id);
    } finally {
      setBusyId("");
    }
  }

  async function handleRename(id, currentName) {
    setRenameId(id);
    setRenameValue(currentName);
  }

  async function submitRename() {
    const name = renameValue.trim();
    if (!name || !renameId) {
      setRenameId("");
      return;
    }
    setBusyId(renameId);
    try {
      await onRename(renameId, name);
    } finally {
      setBusyId("");
      setRenameId("");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Xóa project "${name}"?`)) return;
    setBusyId(id);
    try {
      await onDelete(id);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="canvasProjectPanel">
      <div className="canvasProjectActive">
        <span className="canvasProjectActiveLabel">Đang mở</span>
        <strong>{activeName}</strong>
        <span className="canvasProjectActiveMeta">{projects.length} project</span>
      </div>

      <button type="button" className="canvasFlyoutAction primary" onClick={handleCreate} disabled={creating}>
        {creating ? <Loader2 size={14} className="spin" /> : <FolderPlus size={14} />}
        Project mới
      </button>

      <ul className="canvasProjectList">
        {projects.map(project => {
          const isActive = project.id === activeId;
          const busy = busyId === project.id;
          return (
            <li key={project.id} className={`canvasProjectItem${isActive ? " active" : ""}`}>
              {renameId === project.id ? (
                <form
                  className="canvasProjectRenameForm"
                  onSubmit={event => {
                    event.preventDefault();
                    submitRename();
                  }}
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={event => setRenameValue(event.target.value)}
                    onBlur={submitRename}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="canvasProjectOpen"
                  disabled={busy}
                  onClick={() => handleSwitch(project.id)}
                >
                  <span className="canvasProjectName">{project.name}</span>
                  <span className="canvasProjectMeta">
                    {project.nodeCount} node · {formatUpdatedAt(project.updatedAt)}
                  </span>
                  {busy ? <Loader2 size={13} className="spin" /> : null}
                </button>
              )}
              <div className="canvasProjectItemActions">
                <button
                  type="button"
                  className="canvasNodeBtn"
                  title="Đổi tên"
                  onClick={() => handleRename(project.id, project.name)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  className="canvasNodeBtn danger"
                  title="Xóa"
                  disabled={projects.length <= 1}
                  onClick={() => handleDelete(project.id, project.name)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
