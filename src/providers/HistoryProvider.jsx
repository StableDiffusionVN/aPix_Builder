import { useMemo, useState } from "react";
import { createRequiredContext } from "./createRequiredContext.jsx";

const [HistoryContext, useHistoryContext] = createRequiredContext("useHistoryContext");

export { useHistoryContext };

export function HistoryProvider({ children }) {
  const [selectedOutputIndex, setSelectedOutputIndex] = useState(0);
  const [showWaitScreen, setShowWaitScreen] = useState(false);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(() => new Set());
  const [historySelectionAnchor, setHistorySelectionAnchor] = useState(null);

  const value = useMemo(() => ({
    selectedOutputIndex,
    setSelectedOutputIndex,
    showWaitScreen,
    setShowWaitScreen,
    runLogOpen,
    setRunLogOpen,
    selectedHistoryIds,
    setSelectedHistoryIds,
    historySelectionAnchor,
    setHistorySelectionAnchor
  }), [
    historySelectionAnchor,
    runLogOpen,
    selectedHistoryIds,
    selectedOutputIndex,
    showWaitScreen
  ]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}
