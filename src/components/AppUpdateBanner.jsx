import { Download, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

export function AppUpdateBanner({ update, onDownload, onDismiss }) {
  const { t } = useI18n();
  if (!update) return null;

  const label = update.label || `v${update.version}`;

  return (
    <div className="appUpdateBanner" role="status" aria-live="polite">
      <div className="appUpdateBannerContent">
        <p className="appUpdateBannerText">{t("update.available", { version: label })}</p>
        <p className="appUpdateBannerHint">
          {update.notes?.length ? update.notes[0] : t("update.hint")}
        </p>
      </div>
      <div className="appUpdateBannerActions">
        <button type="button" className="appUpdateBannerPrimary" onClick={onDownload}>
          <Download size={14} aria-hidden="true" />
          {t("update.download")}
        </button>
        {!update.mandatory ? (
          <button type="button" className="appUpdateBannerSecondary" onClick={onDismiss}>
            {t("update.later")}
          </button>
        ) : null}
        {!update.mandatory ? (
          <button
            type="button"
            className="appUpdateBannerClose"
            onClick={onDismiss}
            title={t("update.later")}
            aria-label={t("update.later")}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
