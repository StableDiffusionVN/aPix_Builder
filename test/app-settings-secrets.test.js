import { describe, expect, it } from "vitest";
import {
  hasRhStoredSecrets,
  preserveConnectionSecrets,
  preserveRhSecrets
} from "../src/lib/appSettings.js";

describe("app settings secret preservation", () => {
  it("detects stored RunningHub secrets", () => {
    expect(hasRhStoredSecrets({ apiKey: "abc" })).toBe(true);
    expect(hasRhStoredSecrets({ tokens: [{ apiKey: "abc" }] })).toBe(true);
    expect(hasRhStoredSecrets({ tokens: [{ id: "1", apiKey: "abc" }] })).toBe(true);
    expect(hasRhStoredSecrets({ tokens: [{ id: "1", apiKey: "" }] })).toBe(false);
  });

  it("preserves RunningHub token keys when client snapshot is empty", () => {
    const reference = {
      apiKey: "secret-key",
      tokens: [{ id: "t1", label: "Primary", apiKey: "secret-key", enabled: true }]
    };
    const client = {
      apiKey: "",
      tokens: [{ id: "t1", label: "Primary", apiKey: "", enabled: true }]
    };

    const preserved = preserveRhSecrets(client, reference);
    expect(preserved.tokens[0].apiKey).toBe("secret-key");
    expect(preserved.apiKey).toBe("secret-key");
  });

  it("does not overwrite client RunningHub secrets", () => {
    const reference = { apiKey: "old-key", tokens: [] };
    const client = { apiKey: "new-key", tokens: [{ id: "t1", apiKey: "new-key", enabled: true }] };

    const preserved = preserveRhSecrets(client, reference);
    expect(preserved.apiKey).toBe("new-key");
  });

  it("preserves saved ComfyUI servers when client list is empty", () => {
    const reference = {
      comfyAddress: "http://192.168.1.10:8188",
      servers: [{ id: "srv_1", label: "LAN", address: "http://192.168.1.10:8188" }]
    };
    const client = {
      comfyAddress: "http://127.0.0.1:8188",
      servers: []
    };

    const preserved = preserveConnectionSecrets(client, reference);
    expect(preserved.servers).toHaveLength(1);
    expect(preserved.comfyAddress).toBe("http://192.168.1.10:8188");
  });
});
