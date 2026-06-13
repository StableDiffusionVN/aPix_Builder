import { useEffect, useState } from "react";
import { FolderOpen, Loader2, RotateCcw, Save } from "lucide-react";
import { useI18n } from "../i18n/I18nContext";

const EMPTY_SETTINGS = { inputDir: "", outputDir: "", configDir: "", personalDataDir: "" };
const EMPTY_PATHS = { appSettings: "", colorPresets: "", workflowPresets: "", uploads: "" };

function PathField({ fieldKey, label, hint, settings, defaults, onChange, onOpen }) {
  const { t } = useI18n();
  return (
    <label className="field storagePathField" key={fieldKey}>
      <span>{label}</span>
      <span className="storagePathInputWrap">
        <input
          type="text"
          value={settings[fieldKey] || ""}
          placeholder={defaults[fieldKey] || ""}
          spellCheck={false}
          onChange={event => onChange(fieldKey, event.target.value)}
        />
        <button
          type="button"
          className="storageOpenFolderButton"
          title={t("storage.openFolder")}
          aria-label={`${t("storage.openFolder")}: ${label}`}
          onClick={() => onOpen(settings[fieldKey] || defaults[fieldKey])}
        >
          <FolderOpen size={14} />
        </button>
      </span>
      <small>{hint}</small>
    </label>
  );
}

export function StorageSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [defaults, setDefaults] = useState(EMPTY_SETTINGS);
  const [resolvedPaths, setResolvedPaths] = useState(EMPTY_PATHS);
  const [bundledConfigDir, setBundledConfigDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/storage-settings")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("storage.loadError"));
        return data;
      })
      .then(data => {
        if (cancelled) return;
        setSettings(data.settings || EMPTY_SETTINGS);
        setDefaults(data.defaults || EMPTY_SETTINGS);
        setResolvedPaths(data.resolvedPaths || EMPTY_PATHS);
        setBundledConfigDir(data.bundledConfigDir || "");
      })
      .catch(fetchError => {
        if (!cancelled) setError(fetchError.message || t("storage.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function updateField(key, value) {
    setSettings(current => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  async function handleOpenDirectory(directoryPath) {
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/open-directory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: directoryPath })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("storage.openError"));
    } catch (openError) {
      setError(openError.message || t("storage.openError"));
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/storage-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("storage.saveError"));
      setSettings(data.settings);
      setDefaults(data.defaults || defaults);
      setResolvedPaths(data.resolvedPaths || resolvedPaths);
      setBundledConfigDir(data.bundledConfigDir || bundledConfigDir);
      setMessage(t("storage.saved"));
      window.setTimeout(() => window.location.reload(), 700);
    } catch (saveError) {
      setError(saveError.message || t("storage.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="storageSettingsLoading">
        <Loader2 size={18} className="spin" />
        <span>{t("common.loading")}</span>
      </div>
    );
  }

  const personalDataItems = [
    ["appSettings", t("storage.pathAppSettings")],
    ["colorPresets", t("storage.pathColorPresets")],
    ["workflowPresets", t("storage.pathWorkflowPresets")],
    ["uploads", t("storage.pathUploads")]
  ];

  return (
    <div className="storageSettings">
      <section className="storageSettingsSection">
        <header className="storageSettingsSectionHeader">
          <h4>{t("storage.sectionMedia")}</h4>
          <p>{t("storage.sectionMediaHint")}</p>
        </header>
        <div className="settingsPaneFields storageSettingsFields">
          <PathField
            fieldKey="inputDir"
            label={t("storage.input")}
            hint={t("storage.inputHint")}
            settings={settings}
            defaults={defaults}
            onChange={updateField}
            onOpen={handleOpenDirectory}
          />
          <PathField
            fieldKey="outputDir"
            label={t("storage.output")}
            hint={t("storage.outputHint")}
            settings={settings}
            defaults={defaults}
            onChange={updateField}
            onOpen={handleOpenDirectory}
          />
        </div>
      </section>

      <section className="storageSettingsSection">
        <header className="storageSettingsSectionHeader">
          <h4>{t("storage.sectionPersonal")}</h4>
          <p>{t("storage.sectionPersonalHint")}</p>
        </header>
        <div className="settingsPaneFields storageSettingsFields">
          <PathField
            fieldKey="personalDataDir"
            label={t("storage.personal")}
            hint={t("storage.personalHint")}
            settings={settings}
            defaults={defaults}
            onChange={updateField}
            onOpen={handleOpenDirectory}
          />
        </div>
        <div className="storageResolvedPaths">
          {personalDataItems.map(([key, label]) => (
            resolvedPaths[key] ? (
              <div className="storageResolvedPathRow" key={key}>
                <span>{label}</span>
                <code>{resolvedPaths[key]}</code>
              </div>
            ) : null
          ))}
        </div>
      </section>

      <section className="storageSettingsSection">
        <header className="storageSettingsSectionHeader">
          <h4>{t("storage.sectionTemplates")}</h4>
          <p>{t("storage.sectionTemplatesHint")}</p>
        </header>
        <div className="settingsPaneFields storageSettingsFields">
          <PathField
            fieldKey="configDir"
            label={t("storage.config")}
            hint={t("storage.configHint")}
            settings={settings}
            defaults={defaults}
            onChange={updateField}
            onOpen={handleOpenDirectory}
          />
        </div>
        <div className="storageBundledConfigNote">
          <b>{t("storage.bundledDefaults")}</b>
          <span>{t("storage.bundledDefaultsHint")}</span>
          {bundledConfigDir ? <code>{bundledConfigDir}</code> : null}
        </div>
      </section>

      {error ? <div className="storageSettingsMessage error">{error}</div> : null}
      {message ? <div className="storageSettingsMessage success">{message}</div> : null}

      <div className="storageSettingsActions">
        <button
          type="button"
          className="storageSecondaryButton"
          onClick={() => {
            setSettings(defaults);
            setMessage("");
            setError("");
          }}
          disabled={saving}
        >
          <RotateCcw size={13} />
          {t("storage.defaults")}
        </button>
        <button type="button" className="storagePrimaryButton" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {saving ? t("storage.saving") : t("storage.apply")}
        </button>
      </div>
    </div>
  );
}
