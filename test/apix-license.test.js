import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { pushApixKey, readApixKey } from "../server/lib/apixLicense.js";

let dir;
let comfy;
let base;
const received = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "apix-key-"));
  comfy = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      if (req.url === "/sdvn/apix/session") {
        received.push({ body: JSON.parse(body), auth: req.headers.authorization });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, label: "khach" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise(resolve => comfy.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${comfy.address().port}`;
});

afterAll(async () => {
  comfy?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("aPix key push", () => {
  test("no key → nothing is sent", async () => {
    await writeFile(path.join(dir, "app-settings.json"), JSON.stringify({ connection: {} }));
    expect(await readApixKey({ personalDataDir: dir })).toBe("");
    expect(await pushApixKey({ httpBase: base }, { personalDataDir: dir })).toBeNull();
    expect(received).toHaveLength(0);
  });

  test("key is pushed once per server (with the server's auth headers), cached afterwards", async () => {
    await writeFile(path.join(dir, "app-settings.json"), JSON.stringify({ license: { apixKey: "apx_test123" } }));
    const target = { httpBase: base, headers: { authorization: "Basic abc" } };
    expect(await pushApixKey(target, { personalDataDir: dir })).toMatchObject({ supported: true, ok: true });
    await pushApixKey(target, { personalDataDir: dir });
    expect(received).toEqual([{ body: { key: "apx_test123", deviceId: expect.stringMatching(/^desktop-/) }, auth: "Basic abc" }]);
  });

  test("servers without the SDVN route are skipped quietly", async () => {
    const result = await pushApixKey({ httpBase: `${base}/old` }, { personalDataDir: dir });
    expect(result).toMatchObject({ supported: false });
  });
});
