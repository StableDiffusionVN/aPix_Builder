import { Download, X } from "lucide-react";

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

export function OutputGallery({ history = [], onDownload, onRestore, onDelete }) {
  return (
    <section className="historyPanel">
      <div className="panelTitle">
        <h3>Lịch sử tạo</h3>
        <span>{history.length ? `${history.length} gần nhất` : "Local"}</span>
      </div>
      <div className="historyList">
        {history.map(item => {
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
        {!history.length ? (
          <div className="emptyHistory">
            <span>Chưa có lịch sử tạo</span>
            <small>Ảnh đã tạo sẽ được lưu cục bộ trên trình duyệt.</small>
          </div>
        ) : null}
      </div>
    </section>
  );
}
