import { useCallback } from "react";
import { isRunningHubMode } from "./useRunningHub";
import { useExecution } from "./useExecution";
import { useRunningHubExecution } from "./useRunningHubExecution";
import { buildStepJob, resolveRunner } from "../lib/execution/runStep";

/**
 * Unified run orchestration: wraps local + RunningHub execution hooks
 * and exposes a single active interface + runStep abstraction.
 */
export function useRunOrchestration({ onComplete, runLog, executionMode }) {
  const localExecution = useExecution({ onComplete, runLog });
  const rhExecution = useRunningHubExecution({ onComplete, runLog });
  const active = isRunningHubMode(executionMode) ? rhExecution : localExecution;

  const runStep = useCallback((params) => {
    const job = buildStepJob(executionMode, params);
    resolveRunner(executionMode, { localExecution, rhExecution }).runWorkflow(job);
    return job;
  }, [executionMode, localExecution, rhExecution]);

  const buildJob = useCallback((params) => {
    return buildStepJob(executionMode, params);
  }, [executionMode]);

  const getRunner = useCallback(() => {
    return resolveRunner(executionMode, { localExecution, rhExecution });
  }, [executionMode, localExecution, rhExecution]);

  return {
    ...active,
    localExecution,
    rhExecution,
    runStep,
    buildJob,
    getRunner
  };
}
