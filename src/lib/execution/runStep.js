import { requestPayload } from "../template.js";
import { buildRunningHubJob, buildRunningHubWfJob } from "../../hooks/useRunningHubExecution.js";
import { isRunningHubMode } from "../../hooks/useRunningHub.js";

export const EXECUTION_MODES = {
  LOCAL: "local",
  RH_APP: "runninghub-app",
  RH_WF: "runninghub-wf"
};

/**
 * Build a run job for any execution mode.
 * @param {string} mode - local | runninghub-app | runninghub-wf
 * @param {object} params - mode-specific payload
 */
export function buildStepJob(mode, params) {
  const runId = params.runId || crypto.randomUUID();
  const queuedAt = params.queuedAt || new Date().toISOString();

  switch (mode) {
    case EXECUTION_MODES.LOCAL:
      return {
        runId,
        template: params.template,
        address: params.address,
        values: params.values,
        queuedAt
      };
    case EXECUTION_MODES.RH_APP:
      return buildRunningHubJob({
        runId,
        apiKey: params.apiKey,
        apiKeys: params.apiKeys,
        tokenPolicy: params.tokenPolicy,
        rotateIndex: params.rotateIndex,
        webappId: params.webappId,
        nodes: params.nodes,
        values: params.values,
        queuedAt
      });
    case EXECUTION_MODES.RH_WF:
      return buildRunningHubWfJob({
        runId,
        apiKey: params.apiKey,
        apiKeys: params.apiKeys,
        tokenPolicy: params.tokenPolicy,
        rotateIndex: params.rotateIndex,
        templateId: params.templateId,
        values: params.values,
        queuedAt
      });
    default:
      throw new Error(`Unknown execution mode: ${mode}`);
  }
}

/** Pick the active runner (local or RunningHub) for the current mode. */
export function resolveRunner(mode, { localExecution, rhExecution }) {
  return isRunningHubMode(mode) ? rhExecution : localExecution;
}

/**
 * Submit a step: build job + enqueue/run via the appropriate runner.
 * @returns {object} The job that was submitted
 */
export function runStep(mode, params, { localExecution, rhExecution }) {
  const runner = resolveRunner(mode, { localExecution, rhExecution });
  const job = buildStepJob(mode, params);
  runner.runWorkflow(job);
  return job;
}

/** Build a local ComfyUI job from template config + form values. */
export function buildLocalStepJob({ template, address, values, config }) {
  return buildStepJob(EXECUTION_MODES.LOCAL, {
    template,
    address,
    values: requestPayload(config, values)
  });
}
