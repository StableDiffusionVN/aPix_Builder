import { useMemo, useState } from "react";
import { Download, Filter, History, Loader2, Star, Workflow, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { getSetting, setSetting } from "../lib/appSettings.js";

function formatTime(value, locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
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

export function OutputGallery({
  history = [],
  maxHistoryDisplay = 100,
  onDownload,
  onRestore,
  onItemClick,
  onDelete,
  selectedIds = null,
  activeId = null,
  pending = false,
  pendingActive = false,
  pendingLabel = "",
  pendingProgressPct = null,
  queueCount = 0,
  onShowWaiting
}) {
  const { locale, t } = useI18n();
  const [timeFilter, setTimeFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(getSetting("favorites.history", [])));
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
  const displayHistory = useMemo(
    () => visibleHistory.slice(0, maxHistoryDisplay),
    [maxHistoryDisplay, visibleHistory]
  );

  function toggleFavorite(id) {
    if (!id) return;
    setFavorites(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setSetting("favorites.history", [...next]);
      return next;
    });
  }

  return (
    <section className="historyPanel">
      <div className="panelTitle">
        <div className="historyPanelTitleCopy">
          <h3>{t("history.title")}</h3>
          <small className="historyMultiSelectHint">{t("history.multiSelectHint")}</small>
        </div>
        <div className="historyHeaderTools">
          <label className={`historyIconFilter ${timeFilter !== "all" ? "active" : ""}`} title={t("history.filterTime")}>
            <Filter size={14} />
            <select value={timeFilter} onChange={event => setTimeFilter(event.target.value)} aria-label={t("history.filterTime")}>
              <option value="all">{t("history.allTime")}</option>
              <option value="day">{t("history.today")}</option>
              <option value="month">{t("history.month")}</option>
              <option value="year">{t("history.year")}</option>
            </select>
          </label>
          <label className={`historyIconFilter ${templateFilter !== "all" ? "active" : ""}`} title={t("history.filterTemplate")}>
            <Workflow size={14} />
            <select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label={t("history.filterTemplate")}>
              <option value="all">{t("history.allTemplates")}</option>
              {templateOptions.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`historyIconButton ${favoritesOnly ? "active" : ""}`}
            onClick={() => setFavoritesOnly(current => !current)}
            title={t("history.favoritesOnly")}
          >
            <Star size={14} />
          </button>
        </div>
      </div>
      <div className="historyList">
        {pending ? (
          <article
            className={`historyItem pendingItem ${pendingActive ? "active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onShowWaiting?.()}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onShowWaiting?.();
              }
            }}
            title={t("history.returnProcessing")}
          >
            <span className="historyThumb pendingThumb">
              <Loader2 size={20} className="spin" />
              {pendingProgressPct !== null ? <b>{pendingProgressPct}%</b> : null}
            </span>
            <div className="historyMeta">
              <strong>{t("history.processing")}{queueCount > 0 ? ` (+${queueCount} ${t("history.queued")})` : ""}</strong>
              <span>{pendingLabel || t("history.running")}</span>
            </div>
          </article>
        ) : null}
        {displayHistory.map(item => {
          const primaryOutput = item.outputs?.[0];
          const isSelected = selectedIds?.has?.(item.id);
          const isActive = activeId && item.id === activeId;
          return (
            <article
              className={`historyItem${isSelected ? " isSelected" : ""}${isActive ? " active" : ""}`}
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
              onClick={event => {
                if (onItemClick) onItemClick(item, event);
                else onRestore?.(item);
              }}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (onItemClick) onItemClick(item, event);
                  else onRestore?.(item);
                }
              }}
            >
              <span className="historyThumb">
                {primaryOutput ? (
                  <img
                    src={primaryOutput.url}
                    alt={primaryOutput.filename || item.templateName}
                    draggable="false"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                {isSelected ? <span className="historySelectBadge" aria-hidden="true">✓</span> : null}
              </span>
              <div className="historyMeta">
                <strong>{item.templateName || item.templateId || "Workflow"}</strong>
                <span>{formatTime(item.createdAt, locale)}</span>
                {item.durationMs ? (
                  <small>{formatDuration(item.durationMs)}</small>
                ) : null}
              </div>
              <div className="historyActions">
                <button className={`thumbAction ${favorites.has(item.id) ? "isFavorite" : ""}`} onClick={event => {
                  event.stopPropagation();
                  toggleFavorite(item.id);
                }} title={favorites.has(item.id) ? t("history.unfavorite") : t("history.favorite")}>
                  <Star size={14} />
                </button>
                {primaryOutput ? (
                  <button className="thumbAction" onClick={event => {
                    event.stopPropagation();
                    onDownload(primaryOutput);
                  }} title={t("preview.download")}>
                    <Download size={14} />
                  </button>
                ) : null}
                <button className="thumbAction danger" onClick={event => {
                  event.stopPropagation();
                  onDelete(item.id);
                }} title={t("history.delete")}>
                  <X size={14} />
                </button>
              </div>
            </article>
          );
        })}
        {!displayHistory.length && !pending ? (
          <div className="emptyHistory">
            <span className="emptyHistoryIcon" aria-hidden="true">
              <History size={16} />
            </span>
            <span className="emptyHistoryCopy">
              <strong>{history.length ? t("history.noMatch") : t("history.empty")}</strong>
              <small>{history.length ? t("history.noMatchHint") : t("history.emptyHint")}</small>
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
