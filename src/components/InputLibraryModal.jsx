import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Filter, Images, ListChecks, Loader2, Star, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext.jsx";
import { filterInputLibraryImages, getInputImageUrl } from "../lib/inputImageUtils.js";

function InputLibraryThumb({ image, onSelect, title }) {
  const [broken, setBroken] = useState(false);
  const url = getInputImageUrl(image);

  useEffect(() => {
    setBroken(false);
  }, [url]);

  return (
    <button
      type="button"
      className={`inputLibraryThumb${broken ? " isBroken" : ""}`}
      onClick={() => onSelect(image.name)}
      title={title || image.name}
    >
      {url && !broken ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="inputLibraryThumbFallback" aria-hidden="true">
          {String(image.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </button>
  );
}

export function InputLibraryModal({
  open,
  onClose,
  loading = false,
  inputImages = [],
  favoriteInputImages,
  timeFilter = "all",
  onTimeFilterChange,
  favoritesOnly = false,
  onFavoritesOnlyChange,
  supportsMultipleImages = false,
  multiSelect = false,
  onMultiSelectChange,
  selectedImages = [],
  onSelectImage,
  onToggleFavorite,
  onViewImage,
  onDeleteImage,
  overlayClassName = ""
}) {
  const { t } = useI18n();
  const favorites = favoriteInputImages instanceof Set
    ? favoriteInputImages
    : new Set(favoriteInputImages || []);

  const visibleInputImages = useMemo(
    () => filterInputLibraryImages(inputImages, {
      favoritesOnly,
      favoriteNames: favorites,
      timeFilter
    }),
    [inputImages, favorites, favoritesOnly, timeFilter]
  );

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`inputLibraryModal${overlayClassName ? ` ${overlayClassName}` : ""}`}
      role="presentation"
      onMouseDown={() => onClose?.()}
    >
      <section
        className="inputLibraryPanel"
        role="dialog"
        aria-modal="true"
        aria-label={t("field.inputLibrary")}
        aria-busy={loading}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="inputLibraryHeader">
          <div>
            <h3>{t("field.inputLibrary")}</h3>
            <p>
              {loading
                ? t("field.libraryLoading")
                : t("field.imageCount", {
                  visible: visibleInputImages.length,
                  total: inputImages.length
                })}
            </p>
          </div>
          <div className="inputLibraryHeaderTools">
            <label
              className={`historyIconFilter ${timeFilter !== "all" ? "active" : ""}`}
              title={t("history.filterTime")}
            >
              <Filter size={14} />
              <select
                value={timeFilter}
                onChange={event => onTimeFilterChange?.(event.target.value)}
                aria-label={t("history.filterTime")}
              >
                <option value="all">{t("history.allTime")}</option>
                <option value="day">{t("history.today")}</option>
                <option value="month">{t("history.month")}</option>
                <option value="year">{t("history.year")}</option>
              </select>
            </label>
            <button
              type="button"
              className={`historyIconButton ${favoritesOnly ? "active" : ""}`}
              onClick={() => onFavoritesOnlyChange?.(!favoritesOnly)}
              title={t("history.favoritesOnly")}
            >
              <Star size={14} />
            </button>
            {supportsMultipleImages ? (
              <button
                type="button"
                className={`historyIconButton ${multiSelect ? "active" : ""}`}
                onClick={() => onMultiSelectChange?.(!multiSelect)}
                title={multiSelect ? t("field.multiSelectOff") : t("field.multiSelectOn")}
                aria-pressed={multiSelect}
              >
                <ListChecks size={14} />
              </button>
            ) : null}
            <button
              type="button"
              className="imageLightboxClose inPanel"
              onClick={() => onClose?.()}
              title={t("common.close")}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {loading ? (
          <div className="inputLibraryEmpty">
            <Loader2 size={28} className="spin" />
            <strong>{t("field.libraryLoading")}</strong>
          </div>
        ) : visibleInputImages.length > 0 ? (
          <div className="inputLibraryGrid">
            {visibleInputImages.map(image => {
              const isLibrarySelected = selectedImages.some(
                item => item?.kind === "input-image" && item.name === image.name
              );
              return (
                <article
                  key={image.name}
                  className={`inputLibraryItem${
                    isLibrarySelected ? " isSelected" : ""
                  }${multiSelect ? " isMultiSelectMode" : ""}`}
                >
                  <InputLibraryThumb
                    image={image}
                    onSelect={onSelectImage}
                    title={multiSelect ? t("field.toggleImage") : t("field.chooseImage")}
                  />
                  {multiSelect && isLibrarySelected ? (
                    <span className="inputLibrarySelectedBadge" aria-hidden="true">
                      <Check size={14} strokeWidth={2.8} />
                    </span>
                  ) : null}
                  <div className="inputLibraryActions">
                    <button
                      type="button"
                      className={favorites.has(image.name) ? "isFavorite" : ""}
                      onClick={event => {
                        event.stopPropagation();
                        onToggleFavorite?.(image.name);
                      }}
                      title={favorites.has(image.name) ? t("history.unfavorite") : t("history.favorite")}
                    >
                      <Star size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onSelectImage?.(image.name);
                      }}
                      title={t("field.select")}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onViewImage?.(image);
                      }}
                      title={t("field.viewImage")}
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onDeleteImage?.(image);
                      }}
                      title={t("field.deleteImage")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="inputLibraryEmpty">
            <Images size={34} />
            <strong>{inputImages.length ? t("field.noMatchingImages") : t("field.noInputImages")}</strong>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
