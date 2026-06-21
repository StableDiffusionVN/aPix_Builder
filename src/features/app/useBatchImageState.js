import { useCallback } from "react";
import {
  expandImageBatchByKeys,
  expandImageBatchValues,
  flattenInputs,
  requestPayload
} from "../../lib/template";
import { expandFolderImageValues } from "../../lib/localImageFolder.js";
import { nodeFieldKey } from "../../hooks/useRunningHub";
import { buildRhRunAuth, hasRhApiKey } from "../../lib/rhTokenPool.js";
import { localizeRuntimeMessage } from "../../i18n/I18nContext";

export function useBatchImageState({
  locale,
  t,
  executionMode,
  inputs,
  values,
  selectedTemplate,
  comfyAddress,
  rhSettings,
  rhNodes,
  rhValues,
  rhWfConfig,
  rhWfInputs,
  rhWfValues,
  rhWfSelectedTemplate,
  runStep,
  setError,
  setStatus,
  setShowWaitScreen
}) {
  const isRunningHubApp = executionMode === "runninghub-app";
  const isRunningHubWf = executionMode === "runninghub-wf";

  const runWithBatchExpansion = useCallback(async () => {
    setShowWaitScreen(true);
    setError("");
    try {
      if (isRunningHubApp) {
        if (!hasRhApiKey(rhSettings)) {
          setError(t("error.rhMissingApiKey"));
          setStatus(t("error.rhMissingConfig"));
          setShowWaitScreen(false);
          return;
        }
        if (!rhNodes.length) {
          setError(t("error.rhMissingNodes"));
          setStatus(t("error.rhMissingAppNodes"));
          setShowWaitScreen(false);
          return;
        }
        const rhAuth = buildRhRunAuth(rhSettings);
        const imageKeys = rhNodes
          .filter(node => String(node.fieldType || "").toUpperCase() === "IMAGE")
          .map(nodeFieldKey);
        const expandedRhValues = await expandFolderImageValues(rhValues, imageKeys);
        for (const batchValues of expandImageBatchByKeys(expandedRhValues, imageKeys)) {
          runStep({
            ...rhAuth,
            webappId: rhSettings.webappId.trim(),
            nodes: rhNodes,
            values: batchValues
          });
        }
        return;
      }
      if (isRunningHubWf) {
        const workflowId = String(rhWfConfig?.runninghub?.workflowId || "").trim();
        if (!hasRhApiKey(rhSettings)) {
          setError(t("error.rhMissingApiKey"));
          setStatus(t("error.rhMissingConfig"));
          setShowWaitScreen(false);
          return;
        }
        if (!rhWfConfig || !rhWfInputs.length) {
          setError(t("error.rhWfMissingTemplate"));
          setStatus(t("error.rhWfMissingTemplateShort"));
          setShowWaitScreen(false);
          return;
        }
        if (!workflowId) {
          setError(t("error.rhMissingWorkflowId"));
          setStatus(t("error.rhMissingWorkflowIdShort"));
          setShowWaitScreen(false);
          return;
        }
        const rhAuth = buildRhRunAuth(rhSettings);
        const expandedRhWfValues = await expandFolderImageValues(rhWfValues);
        for (const batchValues of expandImageBatchValues(rhWfInputs, expandedRhWfValues)) {
          runStep({
            ...rhAuth,
            templateId: rhWfSelectedTemplate,
            values: batchValues
          });
        }
        return;
      }
      const expandedValues = await expandFolderImageValues(values);
      for (const batchValues of expandImageBatchValues(inputs, expandedValues)) {
        runStep({
          template: selectedTemplate,
          address: comfyAddress,
          values: requestPayload(inputs, batchValues)
        });
      }
    } catch (err) {
      const message = localizeRuntimeMessage(err.message, locale);
      setError(message);
      setStatus(message);
      setShowWaitScreen(false);
    }
  }, [
    comfyAddress,
    inputs,
    isRunningHubApp,
    isRunningHubWf,
    locale,
    rhNodes,
    rhSettings,
    rhValues,
    rhWfConfig,
    rhWfInputs,
    rhWfSelectedTemplate,
    rhWfValues,
    runStep,
    selectedTemplate,
    setError,
    setShowWaitScreen,
    setStatus,
    t,
    values
  ]);

  return { runWithBatchExpansion };
}
