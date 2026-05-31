import { useEffect, useState } from "react";

export function useDiscovery(comfyAddress) {
  const [discovery, setDiscovery] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  useEffect(() => {
    if (!comfyAddress) { setDiscovery(null); return; }
    const controller = new AbortController();
    setDiscoveryLoading(true);
    fetch(`/api/comfy-discovery?address=${encodeURIComponent(comfyAddress)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Không quét được ComfyUI server")))
      .then(data => setDiscovery(data))
      .catch(err => { if (err.name !== "AbortError") setDiscovery(null); })
      .finally(() => { if (!controller.signal.aborted) setDiscoveryLoading(false); });
    return () => controller.abort();
  }, [comfyAddress]);

  return { discovery, setDiscovery, discoveryLoading };
}
