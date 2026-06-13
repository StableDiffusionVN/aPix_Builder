import { useMemo, useState } from "react";
import { loadExecutionMode } from "../hooks/useRunningHub.js";
import { createRequiredContext } from "./createRequiredContext.jsx";

const [ExecutionContext, useExecutionContext] = createRequiredContext("useExecutionContext");

export { useExecutionContext };

export function ExecutionProvider({ children }) {
  const [executionMode, setExecutionMode] = useState(loadExecutionMode);
  const [rhValues, setRhValues] = useState({});
  const [rhWfValues, setRhWfValues] = useState({});
  const [rhTestResult, setRhTestResult] = useState(null);
  const [rhTesting, setRhTesting] = useState(false);
  const [rhAccount, setRhAccount] = useState(null);
  const [rhAccountLoading, setRhAccountLoading] = useState(false);
  const [rhAccountError, setRhAccountError] = useState("");
  const [rhTokenAccounts, setRhTokenAccounts] = useState([]);

  const value = useMemo(() => ({
    executionMode,
    setExecutionMode,
    rhValues,
    setRhValues,
    rhWfValues,
    setRhWfValues,
    rhTestResult,
    setRhTestResult,
    rhTesting,
    setRhTesting,
    rhAccount,
    setRhAccount,
    rhAccountLoading,
    setRhAccountLoading,
    rhAccountError,
    setRhAccountError,
    rhTokenAccounts,
    setRhTokenAccounts
  }), [
    executionMode,
    rhAccount,
    rhAccountError,
    rhAccountLoading,
    rhTestResult,
    rhTesting,
    rhTokenAccounts,
    rhValues,
    rhWfValues
  ]);

  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}
