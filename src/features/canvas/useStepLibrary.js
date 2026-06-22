import { useCallback, useEffect, useState } from "react";
import { fetchDefaultRhApps, fetchSavedRhApps, listRhAppOptions } from "../../lib/rhSavedApps.js";
import { deriveRhAppPorts, deriveStepPorts, STEP_KINDS } from "./canvasModel.js";

async function fetchTemplateList(scope) {
  const query = scope === STEP_KINDS.RH_WF ? "?scope=runninghub-wf" : "";
  const response = await fetch(`/api/templates${query}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.templates) ? data.templates : [];
}

/**
 * Aggregates every saved template / app across the three execution modes into a
 * single palette and exposes a loader that resolves a step's YAML ports.
 */
export function useStepLibrary() {
  const [library, setLibrary] = useState({ local: [], rhWf: [], rhApp: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const [local, rhWf, rhAppList] = await Promise.allSettled([
      fetchTemplateList(STEP_KINDS.LOCAL),
      fetchTemplateList(STEP_KINDS.RH_WF),
      (async () => {
        const [defaults, saved] = await Promise.all([
          fetchDefaultRhApps().catch(() => []),
          fetchSavedRhApps().catch(() => [])
        ]);
        return listRhAppOptions(defaults, saved);
      })()
    ]);
    setLibrary({
      local: local.status === "fulfilled" ? local.value : [],
      rhWf: rhWf.status === "fulfilled" ? rhWf.value : [],
      rhApp: rhAppList.status === "fulfilled" ? rhAppList.value : []
    });
    if (local.status === "rejected" && rhWf.status === "rejected") {
      setError(local.reason?.message || "Failed to load templates");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { library, loading, error, reload };
}

/**
 * Resolve a step definition into ports + display config.
 * @param {{kind:string, ref:string, apiKey?:string}} step
 */
export async function loadStepDefinition({ kind, ref, apiKey }) {
  if (kind === STEP_KINDS.RH_APP) {
    if (!apiKey) throw new Error("RunningHub API key required to load app nodes");
    const response = await fetch("/api/runninghub/nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey.trim(), webappId: String(ref).trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.msg || `HTTP ${response.status}`);
    const nodes = data.nodes || [];
    return {
      kind,
      ref,
      name: data.webappName || `RunningHub ${ref}`,
      nodes,
      ports: deriveRhAppPorts(nodes),
      config: null
    };
  }

  const scopeQuery = kind === STEP_KINDS.RH_WF ? "&scope=runninghub-wf" : "";
  const response = await fetch(`/api/config?template=${encodeURIComponent(ref)}${scopeQuery}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return {
    kind,
    ref,
    name: data.config?.app?.name || data.template?.name || ref,
    config: data.config,
    serverAddress: data.server?.address || data.config?.server?.address || "",
    ports: deriveStepPorts(data.config)
  };
}
