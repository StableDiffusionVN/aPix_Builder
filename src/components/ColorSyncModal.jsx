import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";
import { COLOR_SYNC_GROUP_IDS } from "../lib/colorAdjustPersistence";

export function ColorSyncModal({
  open,
  targetCount = 0,
  onClose,
  onConfirm
}) {
  const { t } = useI18n();
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(COLOR_SYNC_GROUP_IDS));

  const groupOptions = useMemo(() => COLOR_SYNC_GROUP_IDS.map(id => ({
    id,
    label: t(`colorPanel.syncGroup.${id}`)
  })), [t]);

  useEffect(() => {
    if (open) setSelectedGroups(new Set(COLOR_SYNC_GROUP_IDS));
  }, [open]);

  if (!open) return null;

  function toggleGroup(id) {
    setSelectedGroups(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllGroups() {
    setSelectedGroups(new Set(COLOR_SYNC_GROUP_IDS));
  }

  function clearAllGroups() {
    setSelectedGroups(new Set());
  }

  function handleConfirm() {
    const groups = COLOR_SYNC_GROUP_IDS.filter(id => selectedGroups.has(id));
    if (!groups.length) return;
    onConfirm?.(groups);
  }

  return (
    <div className="modalBackdrop colorSyncModalBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settingsModal colorSyncModal"
        role="dialog"
        aria-modal="true"
        aria-label={t("colorPanel.syncTitle")}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modalHeader colorSyncModalHeader">
          <div className="colorSyncModalHeading">
            <h2>{t("colorPanel.syncTitle")}</h2>
            <p>{t("colorPanel.syncDescription", { count: targetCount })}</p>
          </div>
          <button type="button" className="modalClose" onClick={onClose} title={t("common.close")}>
            <X size={18} />
          </button>
        </div>

        <div className="colorSyncModalSection">
          <div className="colorSyncModalSectionHead">
            <span className="colorSyncModalSectionLabel">{t("colorPanel.syncGroupsLabel")}</span>
            <div className="colorSyncModalQuickActions">
              <button type="button" onClick={selectAllGroups}>{t("colorPanel.syncSelectAll")}</button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={clearAllGroups}>{t("colorPanel.syncSelectNone")}</button>
            </div>
          </div>
          <div className="colorSyncGroupList" role="group" aria-label={t("colorPanel.syncGroupsLabel")}>
            {groupOptions.map(group => {
              const selected = selectedGroups.has(group.id);
              return (
                <button
                  type="button"
                  key={group.id}
                  className={`colorSyncGroupOption${selected ? " isSelected" : ""}`}
                  onClick={() => toggleGroup(group.id)}
                  aria-pressed={selected}
                >
                  <span className="colorSyncGroupCheck" aria-hidden="true">
                    {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                  </span>
                  <span className="colorSyncGroupLabel">{group.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="colorSyncModalActions">
          <button type="button" className="secondaryActionButton" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primaryActionButton"
            onClick={handleConfirm}
            disabled={!selectedGroups.size}
          >
            {t("colorPanel.syncConfirm")}
          </button>
        </div>
      </section>
    </div>
  );
}
