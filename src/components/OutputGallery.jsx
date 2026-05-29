import { useMemo, useState } from "react";
import { Download, Filter, Star, Workflow, X } from "lucide-react";

const HISTORY_FAVORITES_KEY = "comfyui-build:history-favorites:v1";

function readStoredSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, value) {
  localStorage.setItem(key, JSON.stringify([...value]));
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function matchesTimeFilter(value, filter) {
  if (filter === "all") return true;
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return false;
  const now = new Date();
  if (filter === "day") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }
  if (filter === "month") {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth();
  }
  if (filter === "year") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

export function OutputGallery({ history = [], onDownload, onRestore, onDelete }) {
  const [timeFilter, setTimeFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => readStoredSet(HISTORY_FAVORITES_KEY));
  const templateOptions = useMemo(() => {
    const seen = new Map();
    for (const item of history) {
      const id = item.templateId || item.templateName;
      if (!id || seen.has(id)) continue;
      seen.set(id, item.templateName || item.templateId || id);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [history]);
  const visibleHistory = useMemo(() => history.filter(item => {
    if (favoritesOnly && !favorites.has(item.id)) return false;
    if (templateFilter !== "all" && (item.templateId || item.templateName) !== templateFilter) return false;
    return matchesTimeFilter(item.createdAt || item.completedAt || item.submittedAt, timeFilter);
  }), [favorites, favoritesOnly, history, templateFilter, timeFilter]);

  function toggleFavorite(id) {
    if (!id) return;
    setFavorites(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeStoredSet(HISTORY_FAVORITES_KEY, next);
      return next;
    });
  }

  return (
    <section className="historyPanel">
      <div className="panelTitle">
        <h3>Lịch sử tạo</h3>
        <div className="historyHeaderTools">
          <label className={`historyIconFilter ${timeFilter !== "all" ? "active" : ""}`} title="Lọc thời gian">
            <Filter size={14} />
            <select value={timeFilter} onChange={event => setTimeFilter(event.target.value)} aria-label="Lọc thời gian lịch sử">
              <option value="all">Tất cả thời gian</option>
              <option value="day">Hôm nay</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm này</option>
            </select>
          </label>
          <label className={`historyIconFilter ${templateFilter !== "all" ? "active" : ""}`} title="Lọc mẫu API">
            <Workflow size={14} />
            <select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label="Lọc mẫu API lịch sử">
              <option value="all">Tất cả mẫu API</option>
              {templateOptions.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`historyIconButton ${favoritesOnly ? "active" : ""}`}
            onClick={() => setFavoritesOnly(current => !current)}
            title="Chỉ xem favourite"
          >
            <Star size={14} />
          </button>
        </div>
      </div>
      <div className="historyList">
        {visibleHistory.map(item => {
          const primaryOutput = item.outputs?.[0];
          return (
            <article
              className="historyItem"
              key={item.id}
              role="button"
              tabIndex={0}
              draggable={Boolean(primaryOutput)}
              onDragStart={event => {
                if (!primaryOutput) return;
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("application/x-comfy-output-image", JSON.stringify({
                  url: primaryOutput.url,
                  filename: primaryOutput.filename || `${item.templateId || "output"}.png`
                }));
                event.dataTransfer.setData("text/uri-list", primaryOutput.url);
              }}
              onClick={() => onRestore(item)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRestore(item);
                }
              }}
            >
              <span className="historyThumb">
                {primaryOutput ? <img src={primaryOutput.url} alt={primaryOutput.filename || item.templateName} /> : null}
              </span>
              <div className="historyMeta">
                <strong>{item.templateName || item.templateId || "Workflow"}</strong>
                <span>{formatTime(item.createdAt)} · Prompt {item.promptId || "n/a"}</span>
                {item.durationMs ? (
                  <span>Hoàn thành trong {formatDuration(item.durationMs)}</span>
                ) : null}
                <small>{item.address}</small>
              </div>
              <div className="historyActions">
                <button className={`thumbAction ${favorites.has(item.id) ? "isFavorite" : ""}`} onClick={event => {
                  event.stopPropagation();
                  toggleFavorite(item.id);
                }} title={favorites.has(item.id) ? "Bỏ favourite" : "Favourite ảnh"}>
                  <Star size={14} />
                </button>
                {primaryOutput ? (
                  <button className="thumbAction" onClick={event => {
                    event.stopPropagation();
                    onDownload(primaryOutput);
                  }} title="Tải ảnh xuống">
                    <Download size={14} />
                  </button>
                ) : null}
                <button className="thumbAction danger" onClick={event => {
                  event.stopPropagation();
                  onDelete(item.id);
                }} title="Xóa khỏi lịch sử">
                  <X size={14} />
                </button>
              </div>
            </article>
          );
        })}
        {!visibleHistory.length ? (
          <div className="emptyHistory">
            <span>{history.length ? "Không có lịch sử khớp bộ lọc" : "Chưa có lịch sử tạo"}</span>
            <small>{history.length ? "Đổi bộ lọc hoặc tắt Favourite." : "Ảnh đã tạo sẽ được lưu cục bộ trên trình duyệt."}</small>
          </div>
        ) : null}
      </div>
    </section>
  );
}
