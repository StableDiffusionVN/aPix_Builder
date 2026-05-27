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
