import { useI18n } from "../i18n/I18nContext.jsx";
import { ChevronRight } from "lucide-react";

export function HistoryCount({ shown, total }) {
  const { t } = useI18n();
  return (
    <span className="historyCount" aria-live="polite" aria-label={t("history.showingCount", { shown, total })}>
      {shown}/{total}
    </span>
  );
}

export function HistoryPagination({ shown, total, onMore }) {
  const { t } = useI18n();
  if (shown >= total) return null;
  return (
    <button type="button" className="historyMoreTile" onClick={onMore} aria-label={t("history.showMore")}>
      <ChevronRight size={18} />
      <span>{t("history.more")}</span>
    </button>
  );
}
