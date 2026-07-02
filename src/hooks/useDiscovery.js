import { useEffect, useState } from "react";
import { augmentDiscoveryWithSdvn } from "../lib/sdvnModels";

export function useDiscovery(comfyAddress, sdvnModelTypes) {
  const [discovery, setDiscovery] = useState(null);
  const [discoveryRaw, setDiscoveryRaw] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const typesKey = Array.isArray(sdvnModelTypes) ? sdvnModelTypes.join(",") : "";

  useEffect(() => {
    if (!comfyAddress) { setDiscovery(null); setDiscoveryRaw(null); return; }
    const controller = new AbortController();
    setDiscoveryLoading(true);
    fetch(`/api/comfy-discovery?address=${encodeURIComponent(comfyAddress)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Không quét được ComfyUI server")))
      // Bơm danh sách model SDVN cho các type có node loader SDVN (server đã tính sẵn).
      // Giữ bản thô (chưa bơm) cho canvas — mỗi node canvas tự áp quy tắc SDVN theo template của nó.
      .then(async data => {
        const augmented = await augmentDiscoveryWithSdvn(data, typesKey ? typesKey.split(",") : [], controller.signal);
        if (!controller.signal.aborted) {
          setDiscoveryRaw(data);
          setDiscovery(augmented);
        }
      })
      .catch(err => { if (err.name !== "AbortError") { setDiscovery(null); setDiscoveryRaw(null); } })
      .finally(() => { if (!controller.signal.aborted) setDiscoveryLoading(false); });
    return () => controller.abort();
  }, [comfyAddress, typesKey]);

  return { discovery, discoveryRaw, setDiscovery, discoveryLoading };
}
