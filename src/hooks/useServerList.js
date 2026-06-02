import { useRef, useState } from "react";

const SERVERS_KEY = "comfyui-build:servers:v1";

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistData(list) {
  try { localStorage.setItem(SERVERS_KEY, JSON.stringify(list)); } catch {}
}

export function useServerList() {
  const listRef = useRef(loadData());
  const [, forceRender] = useState(0);

  function getServers() {
    return listRef.current;
  }

  function addServer(label, address) {
    const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const next = [...listRef.current, { id, label: label.trim() || address, address }];
    listRef.current = next;
    persistData(next);
    forceRender(n => n + 1);
    return id;
  }

  function removeServer(id) {
    const next = listRef.current.filter(s => s.id !== id);
    listRef.current = next;
    persistData(next);
    forceRender(n => n + 1);
  }

  return { getServers, addServer, removeServer };
}
