import { useEffect, useState } from "react";
import { augmentDiscoveryWithSdvn } from "../lib/sdvnModels";

export function useDiscovery(comfyAddress, sdvnModelTypes) {
  const [discovery, setDiscovery] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const typesKey = Array.isArray(sdvnModelTypes) ? sdvnModelTypes.join(",") : "";

  useEffect(() => {
    if (!comfyAddress) { setDiscovery(null); return; }
    const controller = new AbortController();
    setDiscoveryLoading(true);
    fetch(`/api/comfy-discovery?address=${encodeURIComponent(comfyAddress)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Không quét được ComfyUI server")))
      // Bơm danh sách model SDVN cho các type có node loader SDVN (server đã tính sẵn).
      .then(data => augmentDiscoveryWithSdvn(data, typesKey ? typesKey.split(",") : [], controller.signal))
      .then(data => { if (!controller.signal.aborted) setDiscovery(data); })
      .catch(err => { if (err.name !== "AbortError") setDiscovery(null); })
      .finally(() => { if (!controller.signal.aborted) setDiscoveryLoading(false); });
    return () => controller.abort();
  }, [comfyAddress, typesKey]);

  return { discovery, setDiscovery, discoveryLoading };
}
