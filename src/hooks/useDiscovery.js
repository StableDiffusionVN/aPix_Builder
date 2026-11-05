import { useEffect, useState } from "react";
import { augmentDiscoveryWithSdvn } from "../lib/sdvnModels";

// reloadToken: bump it to rescan the same address (e.g. Colab came up on a fixed link).
export function useDiscovery(comfyAddress, sdvnModelFields, reloadToken = 0) {
  const [discovery, setDiscovery] = useState(null);
  const [discoveryRaw, setDiscoveryRaw] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  // Key ổn định cho effect dep — map field → type nhỏ (vài entry) nên stringify rẻ.
  const fieldsKey = sdvnModelFields && Object.keys(sdvnModelFields).length
    ? JSON.stringify(sdvnModelFields)
    : "";

  useEffect(() => {
    if (!comfyAddress) { setDiscovery(null); setDiscoveryRaw(null); return; }
    const controller = new AbortController();
    setDiscoveryLoading(true);
    fetch(`/api/comfy-discovery?address=${encodeURIComponent(comfyAddress)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Không quét được ComfyUI server")))
      // Gắn thư viện SDVN theo từng field (server đã tính sẵn config.sdvnModelFields).
      // Giữ bản thô (chưa gắn) cho canvas — mỗi node canvas tự áp quy tắc SDVN theo template của nó.
      .then(async data => {
        const augmented = await augmentDiscoveryWithSdvn(data, fieldsKey ? JSON.parse(fieldsKey) : null, controller.signal);
        if (!controller.signal.aborted) {
          setDiscoveryRaw(data);
          setDiscovery(augmented);
        }
      })
      .catch(err => { if (err.name !== "AbortError") { setDiscovery(null); setDiscoveryRaw(null); } })
      .finally(() => { if (!controller.signal.aborted) setDiscoveryLoading(false); });
    return () => controller.abort();
  }, [comfyAddress, fieldsKey, reloadToken]);

  return { discovery, discoveryRaw, setDiscovery, discoveryLoading };
}
