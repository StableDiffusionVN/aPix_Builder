import { useCallback, useEffect } from "react";
import { buildDefaults, flattenInputs } from "../../lib/template.js";
import { rhWfWorkspaceKey } from "../../lib/runningHubTemplate.js";
import { localizeRuntimeMessage } from "../../i18n/I18nContext.jsx";

export function useTemplateWorkspaceActions({
  locale,
  t,
  getLastTemplate,
  getStoredValues,
  loadOutputHistory,
  refreshInputImages,
  resetImageView,
  setComfyAddress,
  setConfig,
  setError,
  setResult,
  setRhWfConfig,
  setRhWfSelectedTemplate,
  setRhWfTemplates,
  setRhWfValues,
  setSelectedOutputIndex,
  setSelectedTemplate,
  setStatus,
  setTemplates,
  setValues,
  defaultComfyServer
}) {
  const loadTemplateConfig = useCallback(async (templateId) => {
    const suffix = templateId ? `?template=${encodeURIComponent(templateId)}` : "";
    const response = await fetch(`/api/config${suffix}`);
    if (!response.ok) throw new Error(t("error.templateConfigApi"));
    const data = await response.json();
    if (data.error) throw new Error(localizeRuntimeMessage(data.error, locale));
    return data;
  }, [locale, t]);

  const loadTemplateRegistry = useCallback(async () => {
    const response = await fetch("/api/templates");
    if (!response.ok) throw new Error(t("error.templateListApi"));
    return response.json();
  }, [t]);

  const loadRhWfTemplateRegistry = useCallback(async () => {
    const response = await fetch("/api/templates?scope=runninghub-wf");
    if (!response.ok) throw new Error(t("error.rhWfListApi"));
    return response.json();
  }, [t]);

  const loadRhWfTemplateConfig = useCallback(async (templateId) => {
    const suffix = templateId
      ? `?template=${encodeURIComponent(templateId)}&scope=runninghub-wf`
      : "?scope=runninghub-wf";
    const response = await fetch(`/api/config${suffix}`);
    if (!response.ok) throw new Error(t("error.rhWfConfigApi"));
    const data = await response.json();
    if (data.error) throw new Error(localizeRuntimeMessage(data.error, locale));
    return data;
  }, [locale, t]);

  const loadRhWfConfig = useCallback(async (templateId, options = {}) => {
    setStatus(t("status.rhWfLoading"));
    setError("");
    if (!options.keepResult) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
    }
    try {
      const data = await loadRhWfTemplateConfig(templateId);
      const nextTemplateId = data.template?.id || templateId || "";
      const defaults = buildDefaults(flattenInputs(data.config?.input));
      const storedValues = nextTemplateId ? getStoredValues(rhWfWorkspaceKey(nextTemplateId)) : null;
      setRhWfConfig(data.config);
      setRhWfValues(options.values || { ...defaults, ...(storedValues || {}) });
      setRhWfSelectedTemplate(nextTemplateId);
      setStatus(`${t("status.rhWfReady")}: ${data.template?.name || data.template?.id || "Default"}`);
    } catch (error) {
      setError(localizeRuntimeMessage(error.message, locale));
      setStatus(t("status.rhWfLoadFailed"));
    }
  }, [
    getStoredValues, loadRhWfTemplateConfig, locale, resetImageView, setError,
    setResult, setRhWfConfig, setRhWfSelectedTemplate, setRhWfValues,
    setSelectedOutputIndex, setStatus, t
  ]);

  const loadConfig = useCallback(async (templateId, options = {}) => {
    setStatus(t("status.yamlLoading"));
    setError("");
    if (!options.keepResult) {
      setResult(null);
      setSelectedOutputIndex(0);
      resetImageView();
    }
    try {
      const data = await loadTemplateConfig(templateId);
      const nextTemplateId = data.template?.id || templateId || "";
      const defaults = buildDefaults(flattenInputs(data.config?.input));
      const storedValues = nextTemplateId ? getStoredValues(nextTemplateId) : null;
      setConfig(data.config);
      setValues(options.values || { ...defaults, ...(storedValues || {}) });
      setSelectedTemplate(nextTemplateId);
      if (!options.preserveServerAddress) {
        setComfyAddress(current => options.address || current || data.server?.address || defaultComfyServer);
      }
      setStatus(`${t("status.yamlReady")}: ${data.template?.name || data.template?.id || "Default"}`);
    } catch (error) {
      setError(localizeRuntimeMessage(error.message, locale));
      setStatus(t("status.yamlFailed"));
    }
  }, [
    defaultComfyServer, getStoredValues, loadTemplateConfig, locale, resetImageView,
    setComfyAddress, setConfig, setError, setResult, setSelectedOutputIndex,
    setSelectedTemplate, setStatus, setValues, t
  ]);

  const reloadTemplates = useCallback(async (nextTemplateId, options = {}) => {
    const registry = await loadTemplateRegistry();
    setTemplates(registry.templates || []);
    await loadConfig(nextTemplateId || registry.default);
    if (options.savedAsCopy) setStatus(t("status.templateSavedCopy"));
  }, [loadConfig, loadTemplateRegistry, setStatus, setTemplates, t]);

  const reloadRhWfTemplates = useCallback(async (nextTemplateId, options = {}) => {
    const registry = await loadRhWfTemplateRegistry();
    setRhWfTemplates(registry.templates || []);
    if (nextTemplateId || registry.default) {
      await loadRhWfConfig(nextTemplateId || registry.default);
    }
    if (options.savedAsCopy) setStatus(t("status.rhWfSavedCopy"));
  }, [loadRhWfConfig, loadRhWfTemplateRegistry, setRhWfTemplates, setStatus, t]);

  const deleteTemplate = useCallback(async (templateId, scope = "local") => {
    const response = await fetch("/api/templates/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, scope })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(localizeRuntimeMessage(data.error, locale) || t("template.deleteError"));
    }
    if (scope === "runninghub-wf") {
      setRhWfTemplates(data.registry?.templates || []);
      if (data.registry?.default) {
        await loadRhWfConfig(data.registry.default);
        setStatus(t("status.rhWfDeleted"));
      } else {
        setRhWfConfig(null);
        setRhWfValues({});
        setRhWfSelectedTemplate("");
        setStatus(t("status.rhWfDeletedEmpty"));
      }
      setError("");
      return;
    }
    setTemplates(data.registry?.templates || []);
    await loadConfig(data.registry?.default || "");
    setError("");
    setStatus(t("status.templateDeleted"));
  }, [
    loadConfig, loadRhWfConfig, locale, setError, setRhWfConfig,
    setRhWfSelectedTemplate, setRhWfTemplates, setRhWfValues, setStatus,
    setTemplates, t
  ]);

  useEffect(() => {
    loadOutputHistory();
    refreshInputImages();
    loadTemplateRegistry()
      .then(data => {
        setTemplates(data.templates || []);
        const storedTemplate = getLastTemplate();
        const hasStoredTemplate = (data.templates || []).some(item => item.id === storedTemplate);
        return loadConfig(hasStoredTemplate ? storedTemplate : data.default);
      })
      .catch(() => loadConfig(""));
  }, []);

  return {
    deleteTemplate,
    loadConfig,
    loadRhWfConfig,
    loadRhWfTemplateRegistry,
    reloadRhWfTemplates,
    reloadTemplates
  };
}
