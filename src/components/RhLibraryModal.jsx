import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  Check,
  ExternalLink,
  Flame,
  Heart,
  Loader2,
  Play,
  Search,
  Sparkles,
  Star,
  X
} from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";
import "../styles/rhLibrary.css";

const SORT_OPTIONS = [
  { id: "RECOMMEND", labelKey: "rhLib.sortRecommend", icon: Sparkles },
  { id: "HOTTEST", labelKey: "rhLib.sortHot", icon: Flame },
  { id: "NEWEST", labelKey: "rhLib.sortNew", icon: Star }
];

const PAGE_SIZE = 30;

function formatCount(value, locale) {
  const number = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(number);
  } catch {
    return String(number);
  }
}

function CoverMedia({ cover, className }) {
  const videoRef = useRef(null);
  if (!cover?.url) {
    return <div className={`${className} rhLibCoverEmpty`} aria-hidden="true" />;
  }
  if (cover.isVideo) {
    return (
      <video
        ref={videoRef}
        className={className}
        src={cover.url}
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={() => videoRef.current?.play().catch(() => {})}
        onMouseLeave={() => {
          videoRef.current?.pause();
        }}
      />
    );
  }
  return (
    <img
      className={className}
      src={cover.thumbnail || cover.url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
    />
  );
}

function RhLibraryCard({ record, locale, onSelect }) {
  return (
    <button type="button" className="rhLibCard" onClick={() => onSelect(record)} title={record.name}>
      <div className="rhLibCardCover">
        <CoverMedia cover={record.cover} className="rhLibCardMedia" />
        {record.cover?.isVideo ? (
          <span className="rhLibCardVideoBadge" aria-hidden="true">
            <Play size={10} />
          </span>
        ) : null}
      </div>
      <div className="rhLibCardBody">
        <span className="rhLibCardName">{record.name}</span>
        <span className="rhLibCardStats">
          <span title="runs"><Play size={10} /> {formatCount(record.stats.useCount, locale)}</span>
          <span title="likes"><Heart size={10} /> {formatCount(record.stats.likeCount, locale)}</span>
          {record.tags[0] ? <span className="rhLibCardTag">{record.tags[0].name}</span> : null}
        </span>
      </div>
    </button>
  );
}

function RhLibraryDetail({ record, kind, locale, t, importState, onImport, onClose }) {
  const detailUrl = `https://www.runninghub.ai/ai-detail/${record.id}`;
  const publishDate = record.publishTime
    ? new Date(record.publishTime).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")
    : "";
  const importing = importState.status === "importing" && importState.id === record.id;
  const imported = importState.status === "done" && importState.id === record.id;

  return (
    <aside className="rhLibDetail" aria-label={record.name}>
      <button type="button" className="rhLibDetailClose" onClick={onClose} aria-label={t("rhLib.close")}>
        <X size={14} />
      </button>
      <div className="rhLibDetailCover">
        <CoverMedia cover={record.cover} className="rhLibDetailMedia" />
      </div>
      <div className="rhLibDetailInfo">
        <h3>{record.name}</h3>
        {record.owner ? (
          <div className="rhLibDetailOwner">
            {record.owner.avatar ? <img src={record.owner.avatar} alt="" loading="lazy" /> : null}
            <span>{record.owner.name}</span>
            {publishDate ? <span className="rhLibDetailDate">· {publishDate}</span> : null}
          </div>
        ) : null}
        <div className="rhLibDetailStats">
          <span><Play size={11} /> {formatCount(record.stats.useCount, locale)} {t("rhLib.uses")}</span>
          <span><Heart size={11} /> {formatCount(record.stats.likeCount, locale)}</span>
          <span><Star size={11} /> {formatCount(record.stats.collectCount, locale)}</span>
        </div>
        {record.tags.length ? (
          <div className="rhLibDetailTags">
            {record.tags.map(tag => <span key={tag.id}>{tag.name}</span>)}
          </div>
        ) : null}
        {record.intro ? <p className="rhLibDetailIntro">{record.intro}</p> : null}
      </div>
      <div className="rhLibDetailActions">
        {kind === "app" ? (
          <button
            type="button"
            className="rhLibImportButton"
            disabled={importing || imported}
            onClick={() => onImport(record)}
          >
            {importing
              ? <><Loader2 size={13} className="spin" /> {t("rhLib.importing")}</>
              : imported
                ? <><Check size={13} /> {t("rhLib.imported")}</>
                : <><ArrowDownToLine size={13} /> {t("rhLib.import")}</>}
          </button>
        ) : (
          <p className="rhLibWorkflowNote">{t("rhLib.workflowImportSoon")}</p>
        )}
        <a className="rhLibDetailLink" href={detailUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={12} /> {t("rhLib.openOnRh")}
        </a>
        {importState.status === "error" && importState.id === record.id ? (
          <p className="rhLibImportError">{importState.error}</p>
        ) : null}
      </div>
    </aside>
  );
}

export function RhLibraryModal({ open, onClose, onImportApp }) {
  const { locale, t } = useI18n();
  const [kind, setKind] = useState("app");
  const [sort, setSort] = useState("RECOMMEND");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tagTree, setTagTree] = useState({ app: null, workflow: null });
  const [tagError, setTagError] = useState(false);
  const [categoryId, setCategoryId] = useState("all");
  const [activeTagIds, setActiveTagIds] = useState([]);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState(null);
  const [importState, setImportState] = useState({ status: "idle", id: "", error: "" });
  const sentinelRef = useRef(null);
  const gridRef = useRef(null);
  const requestSeq = useRef(0);

  const categories = tagTree[kind] || [];
  const activeCategory = categories.find(category => category.id === categoryId) || null;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [open, searchInput]);

  useEffect(() => {
    if (!open || kind === "comfy" || tagTree[kind]) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/rh-library/tags?kind=${kind}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setTagTree(current => ({ ...current, [kind]: data.tags || [] }));
          setTagError(false);
        }
      } catch (error) {
        console.error("Failed to load RH library tags:", error);
        if (!cancelled) setTagError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, tagTree]);

  const effectiveTags = useMemo(() => {
    if (categoryId === "all") return [];
    if (activeTagIds.length) return activeTagIds;
    return (activeCategory?.children || []).map(child => child.id);
  }, [categoryId, activeCategory, activeTagIds]);

  const loadPage = useCallback(async (nextPage, replace) => {
    if (kind === "comfy") return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        kind,
        sort,
        page: String(nextPage),
        size: String(PAGE_SIZE)
      });
      if (search) params.set("search", search);
      if (effectiveTags.length) params.set("tags", effectiveTags.join(","));
      const response = await fetch(`/api/rh-library/list?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (seq !== requestSeq.current) return;
      setTotal(data.total || 0);
      setRecords(current => (replace ? data.records || [] : [...current, ...(data.records || [])]));
      setPage(nextPage);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      console.error("Failed to load RH library list:", error);
      setListError(t("rhLib.loadFailed"));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [kind, sort, search, effectiveTags, t]);

  useEffect(() => {
    if (!open) return;
    setRecords([]);
    setSelected(null);
    gridRef.current?.scrollTo?.({ top: 0 });
    loadPage(1, true);
  }, [open, loadPage]);

  useEffect(() => {
    if (!open) return;
    setImportState({ status: "idle", id: "", error: "" });
  }, [open]);

  const hasMore = records.length < total;

  useEffect(() => {
    if (!open || !hasMore || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        loadPage(page + 1, false);
      }
    }, { root: gridRef.current, rootMargin: "600px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loading, page, loadPage]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (selected) setSelected(null);
      else onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selected, onClose]);

  const handleKindChange = nextKind => {
    if (nextKind === kind) return;
    setKind(nextKind);
    setCategoryId("all");
    setActiveTagIds([]);
    setSelected(null);
  };

  const handleCategorySelect = nextId => {
    setCategoryId(nextId);
    setActiveTagIds([]);
  };

  const toggleTagChip = tagId => {
    setActiveTagIds(current => (
      current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId]
    ));
  };

  const handleImport = useCallback(async record => {
    if (!onImportApp) return;
    setImportState({ status: "importing", id: record.id, error: "" });
    try {
      await onImportApp({ id: record.id, name: record.name });
      setImportState({ status: "done", id: record.id, error: "" });
    } catch (error) {
      setImportState({
        status: "error",
        id: record.id,
        error: error?.message || t("rhLib.importFailed")
      });
    }
  }, [onImportApp, t]);

  if (!open) return null;

  return createPortal(
    <div
      className="rhLibOverlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="rhLibModal"
        role="dialog"
        aria-modal="true"
        aria-label={t("rhLib.title")}
      >
        <header className="rhLibHeader">
          <div className="rhLibHeaderLeft">
            <h2>{t("rhLib.title")}</h2>
            <div className="rhLibKindTabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={kind === "app"}
                className={kind === "app" ? "active" : ""}
                onClick={() => handleKindChange("app")}
              >
                {t("rhLib.tabApps")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === "workflow"}
                className={kind === "workflow" ? "active" : ""}
                onClick={() => handleKindChange("workflow")}
              >
                {t("rhLib.tabWorkflows")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === "comfy"}
                className={kind === "comfy" ? "active" : ""}
                onClick={() => handleKindChange("comfy")}
              >
                {t("rhLib.tabComfy")}
              </button>
            </div>
          </div>
          <div className="rhLibSearch">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              placeholder={t("rhLib.searchPlaceholder")}
              onChange={event => setSearchInput(event.target.value)}
            />
          </div>
          <div className="rhLibSortTabs" role="tablist">
            {SORT_OPTIONS.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={sort === option.id}
                  className={sort === option.id ? "active" : ""}
                  onClick={() => setSort(option.id)}
                >
                  <Icon size={12} /> {t(option.labelKey)}
                </button>
              );
            })}
          </div>
          <button type="button" className="rhLibClose" onClick={() => onClose?.()} aria-label={t("rhLib.close")}>
            <X size={16} />
          </button>
        </header>

        {kind === "comfy" ? (
          <div className="rhLibBody rhLibComfyPlaceholder">
            <div className="rhLibEmpty">
              <p>{t("rhLib.comfySoon")}</p>
            </div>
          </div>
        ) : (
        <div className="rhLibBody">
          <nav className="rhLibSidebar" aria-label={t("rhLib.categories")}>
            <button
              type="button"
              className={categoryId === "all" ? "active" : ""}
              onClick={() => handleCategorySelect("all")}
            >
              {t("rhLib.allCategories")}
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                className={categoryId === category.id ? "active" : ""}
                onClick={() => handleCategorySelect(category.id)}
              >
                {category.name}
              </button>
            ))}
            {tagError ? <p className="rhLibSidebarError">{t("rhLib.tagsFailed")}</p> : null}
          </nav>

          <div className="rhLibContent">
            {activeCategory && activeCategory.children.length > 1 ? (
              <div className="rhLibChips">
                {activeCategory.children.map(child => (
                  <button
                    key={child.id}
                    type="button"
                    className={activeTagIds.includes(child.id) ? "active" : ""}
                    onClick={() => toggleTagChip(child.id)}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="rhLibResultBar">
              <span>{loading && !records.length ? t("rhLib.loading") : t("rhLib.total", { total: formatCount(total, locale) })}</span>
            </div>

            <div className="rhLibGridWrap" ref={gridRef}>
              {listError && !records.length ? (
                <div className="rhLibEmpty">
                  <p>{listError}</p>
                  <button type="button" onClick={() => loadPage(1, true)}>{t("rhLib.retry")}</button>
                </div>
              ) : !loading && !records.length ? (
                <div className="rhLibEmpty"><p>{t("rhLib.empty")}</p></div>
              ) : (
                <div className="rhLibGrid">
                  {records.map(record => (
                    <RhLibraryCard
                      key={record.id}
                      record={record}
                      locale={locale}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              )}
              <div ref={sentinelRef} className="rhLibSentinel" aria-hidden="true">
                {loading && records.length ? <Loader2 size={16} className="spin" /> : null}
              </div>
            </div>
          </div>

          {selected ? (
            <RhLibraryDetail
              record={selected}
              kind={kind}
              locale={locale}
              t={t}
              importState={importState}
              onImport={handleImport}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
        )}
      </section>
    </div>,
    document.body
  );
}
