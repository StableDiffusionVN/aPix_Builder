import { useEffect, useMemo, useState } from "react";
import { Loader2, Star, Trash2 } from "lucide-react";
import { getSetting, setSetting } from "../../lib/appSettings.js";
import { localizeRuntimeMessage, useI18n } from "../../i18n/I18nContext.jsx";

const FAVORITES_KEY = "canvas.workflowLibraryFavorites";

function readFavoriteSlugs() {
  const raw = getSetting(FAVORITES_KEY, []);
  return Array.isArray(raw) ? raw.filter(slug => typeof slug === "string" && slug) : [];
}

function sortWorkflows(workflows, favoriteSlugs, locale) {
  const favorites = new Set(favoriteSlugs);
  return [...workflows].sort((a, b) => {
    const aFavorite = favorites.has(a.slug);
    const bFavorite = favorites.has(b.slug);
    if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
    return String(a.name || a.slug).localeCompare(String(b.name || b.slug), locale, {
      sensitivity: "base"
    });
  });
}

export function CanvasProjectPanel({
  workflows = [],
  loading = false,
  onReload,
  onOpen,
  onDelete
}) {
  const { locale, t } = useI18n();
  const [busySlug, setBusySlug] = useState("");
  const [favoriteSlugs, setFavoriteSlugs] = useState(readFavoriteSlugs);

  useEffect(() => {
    void onReload?.();
  }, [onReload]);

  const sortedWorkflows = useMemo(
    () => sortWorkflows(workflows, favoriteSlugs, locale),
    [workflows, favoriteSlugs, locale]
  );

  function toggleFavorite(slug, event) {
    event.preventDefault();
    event.stopPropagation();
    setFavoriteSlugs(current => {
      const next = current.includes(slug)
        ? current.filter(item => item !== slug)
        : [...current, slug];
      setSetting(FAVORITES_KEY, next);
      return next;
    });
  }

  async function handleOpen(slug) {
    if (!slug || busySlug) return;
    setBusySlug(slug);
    try {
      await onOpen?.(slug);
    } finally {
      setBusySlug("");
    }
  }

  async function handleDelete(workflow, event) {
    event.preventDefault();
    event.stopPropagation();
    const slug = workflow?.slug;
    if (!slug || busySlug) return;
    const name = workflow?.name || slug;
    if (!window.confirm(t("canvas.library.confirmDelete", { name }))) return;
    setBusySlug(slug);
    try {
      await onDelete?.(slug);
      setFavoriteSlugs(current => {
        if (!current.includes(slug)) return current;
        const next = current.filter(item => item !== slug);
        setSetting(FAVORITES_KEY, next);
        return next;
      });
    } catch (error) {
      window.alert(localizeRuntimeMessage(error?.message, locale) || t("canvas.library.deleteFailed"));
    } finally {
      setBusySlug("");
    }
  }

  return (
    <div className="canvasProjectPanel canvasProjectPanelLibrary">
      {loading && sortedWorkflows.length === 0 ? (
        <div className="canvasProjectLibraryLoading">
          <Loader2 size={16} className="spin" />
        </div>
      ) : null}

      {!loading && sortedWorkflows.length === 0 ? (
        <p className="canvasProjectEmpty">{t("canvas.library.empty")}</p>
      ) : null}

      <ul className="canvasProjectList canvasProjectLibraryList">
        {sortedWorkflows.map(workflow => {
          const busy = busySlug === workflow.slug;
          const isFavorite = favoriteSlugs.includes(workflow.slug);
          return (
            <li key={workflow.slug} className="canvasProjectLibraryItem">
              <button
                type="button"
                className="canvasProjectLibraryOpen"
                disabled={busy}
                onClick={() => handleOpen(workflow.slug)}
              >
                <span className="canvasProjectLibraryName">{workflow.name}</span>
                {busy ? <Loader2 size={13} className="spin" /> : null}
              </button>
              <div className="canvasProjectLibraryActions">
                <button
                  type="button"
                  className={`canvasProjectLibraryFav${isFavorite ? " is-active" : ""}`}
                  aria-label={isFavorite ? t("canvas.library.unpin") : t("canvas.library.pin")}
                  title={isFavorite ? t("canvas.library.unpinShort") : t("canvas.library.pinShort")}
                  disabled={busy}
                  onClick={event => toggleFavorite(workflow.slug, event)}
                >
                  <Star size={13} fill={isFavorite ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  className="canvasProjectLibraryDelete"
                  aria-label={t("canvas.library.deleteWorkflow")}
                  title={t("canvas.library.deleteWorkflow")}
                  disabled={busy}
                  onClick={event => handleDelete(workflow, event)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
