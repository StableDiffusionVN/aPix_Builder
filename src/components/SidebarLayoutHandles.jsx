import { useI18n } from "../i18n/I18nContext";

export function SidebarLayoutHandles({ onMoveStart, onResizeStart }) {
  const { t } = useI18n();

  return (
    <div className="sidebarLayoutHandles" aria-hidden="false">
      <div
        className="sidebarMoveHandle"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("sidebar.move")}
        title={t("sidebar.move")}
        onPointerDown={onMoveStart}
      />
      <div
        className="sidebarResizeHandle is-start"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        title={t("sidebar.resize")}
        onPointerDown={event => onResizeStart(event, "start")}
      />
      <div
        className="sidebarResizeHandle is-end"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        title={t("sidebar.resize")}
        onPointerDown={event => onResizeStart(event, "end")}
      />
    </div>
  );
}
