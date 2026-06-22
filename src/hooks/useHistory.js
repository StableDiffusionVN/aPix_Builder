import { useCallback, useState } from "react";

export function useHistory() {
  const [history, setHistory] = useState([]);

  const loadOutputHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/output-history");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.history || []);
    } catch { setHistory([]); }
  }, []);

  const deleteHistoryItem = useCallback(async (id) => {
    try {
      const res = await fetch("/api/output-history/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (res.ok) { setHistory(data.history || []); return data.history; }
    } catch {}
    setHistory(current => current.filter(item => item.id !== id));
    return null;
  }, []);

  return { history, setHistory, loadOutputHistory, deleteHistoryItem };
}
