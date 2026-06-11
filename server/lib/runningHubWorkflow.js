import { payloadToRunningHubNodes, resolveWorkflowInput } from "./workflowPatcher.js";
import { prepareNodeInfoList } from "./runningHubClient.js";

function coerceWorkflowValue(original, nextValue) {
  if (typeof original === "number") {
    const parsed = Number(nextValue);
    return Number.isFinite(parsed) ? parsed : nextValue;
  }
  if (typeof original === "boolean") {
    return nextValue === true || nextValue === "true";
  }
  return nextValue;
}

export async function buildRunningHubNodeInfoList(request, apiKey, options = {}) {
  const nodes = payloadToRunningHubNodes(request);
  if (!nodes.length) return [];
  return prepareNodeInfoList(apiKey, nodes, options);
}

export async function buildPatchedRunningHubWorkflow(workflow, request, apiKey, options = {}) {
  const patched = structuredClone(workflow);
  const nodes = payloadToRunningHubNodes(request);
  if (!nodes.length) return patched;

  const prepared = await prepareNodeInfoList(apiKey, nodes, options);
  for (const item of prepared) {
    const wfKey = `${item.nodeId}-${item.fieldName}`;
    const { nodeInputs, field } = resolveWorkflowInput(patched, wfKey);
    const original = workflow?.[item.nodeId]?.inputs?.[field];
    nodeInputs[field] = coerceWorkflowValue(original, item.fieldValue);
  }
  return patched;
}
