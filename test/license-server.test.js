import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createLicenseServer, isProtectedRepo, parseHuggingFaceUrl } from "../license-server/server.mjs";
import { allowsModel, LicenseStore, signToken, verifyToken } from "../license-server/licenseStore.mjs";

const SECRET = "test-secret-0123456789";
let dir;
let base;
let server;
let store;
const signed = [];

async function post(route, body) {
  const response = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "apix-license-"));
  store = new LicenseStore(dir);
  ({ server } = createLicenseServer({
    store,
    secret: SECRET,
    hfToken: "hf_test",
    protectedRepos: "phamhungd/SDVN-Model",
    maxLinksPerHour: 3,
    signUrl: async target => {
      signed.push(target);
      return `https://cdn.example/${target.file}?sig=1`;
    }
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("aPix license server", () => {
  test("parses HuggingFace blob/resolve links", () => {
    expect(parseHuggingFaceUrl("https://huggingface.co/phamhungd/SDVN-Model/blob/main/a%20b.safetensors"))
      .toEqual({ repo: "phamhungd/SDVN-Model", revision: "main", file: "a b.safetensors" });
    expect(parseHuggingFaceUrl("https://civitai.com/api/download/models/1")).toBeNull();
  });

  test("protected repos: exact or whole account", () => {
    expect(isProtectedRepo("phamhungd/sell-model", ["phamhungd/*"])).toBe(true);
    expect(isProtectedRepo("phamhungd/SDVN-Model", ["phamhungd/SDVN-Model"])).toBe(true);
    expect(isProtectedRepo("phamhungdx/other", ["phamhungd/*"])).toBe(false);
    expect(isProtectedRepo("black-forest-labs/FLUX.1", ["phamhungd/*"])).toBe(false);
  });

  test("tokens are signed and expire", () => {
    const token = signToken({ kid: "k1", exp: Date.now() + 1000 }, SECRET);
    expect(verifyToken(token, SECRET)?.kid).toBe("k1");
    expect(verifyToken(token, "other-secret-0123456")).toBeNull();
    expect(verifyToken(signToken({ kid: "k1", exp: Date.now() - 1 }, SECRET), SECRET)).toBeNull();
  });

  test("model allow-lists", () => {
    expect(allowsModel({ models: "*" }, "x.safetensors")).toBe(true);
    expect(allowsModel({ models: ["flux_*"] }, "flux_yuu.safetensors")).toBe(true);
    expect(allowsModel({ models: ["flux_*"] }, "sdxl.safetensors")).toBe(false);
  });

  test("session reports the key's own expiry, not only the session's", async () => {
    const dated = await store.add({ label: "co-han", days: 30 });
    const forever = await store.add({ label: "vinh-vien" });
    const a = await post("/v1/session", { key: dated.key });
    const b = await post("/v1/session", { key: forever.key });
    expect(a.body.keyExpiresAt).toBe(dated.record.expiresAt);
    expect(Date.parse(a.body.keyExpiresAt)).toBeGreaterThan(Date.parse(a.body.expiresAt));
    expect(b.body.keyExpiresAt).toBeNull();
  });

  test("key → session → signed link; public repos pass through; limits apply", async () => {
    expect((await post("/v1/session", { key: "apx_wrong" })).status).toBe(401);

    const { key } = await store.add({ label: "khach-a", models: ["flux_*"] });
    const session = await post("/v1/session", { key });
    expect(session.status).toBe(200);
    expect(session.body.label).toBe("khach-a");
    const { token } = session.body;

    const publicFile = await post("/v1/download-url", { token, url: "https://huggingface.co/black-forest-labs/FLUX.1/resolve/main/ae.safetensors" });
    expect(publicFile.body).toEqual({ public: true });

    const allowed = await post("/v1/download-url", { token, url: "https://huggingface.co/phamhungd/SDVN-Model/blob/main/flux_yuu.safetensors" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.url).toBe("https://cdn.example/flux_yuu.safetensors?sig=1");
    expect(JSON.stringify(allowed.body)).not.toContain("hf_test");

    const denied = await post("/v1/download-url", { token, url: "https://huggingface.co/phamhungd/SDVN-Model/blob/main/sdxl_other.safetensors" });
    expect(denied.status).toBe(403);

    await post("/v1/download-url", { token, url: "https://huggingface.co/phamhungd/SDVN-Model/blob/main/flux_b.safetensors" });
    await post("/v1/download-url", { token, url: "https://huggingface.co/phamhungd/SDVN-Model/blob/main/flux_c.safetensors" });
    expect((await post("/v1/download-url", { token, url: "https://huggingface.co/phamhungd/SDVN-Model/blob/main/flux_d.safetensors" })).status).toBe(429);

    await store.update("khach-a", { disabled: true });
    expect((await post("/v1/session", { key })).status).toBe(401);
    expect((await post("/v1/download-url", { token: "bad.token", url: "x" })).status).toBe(401);
  });
});
