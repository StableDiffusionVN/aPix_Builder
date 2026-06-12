import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveWorkflowInput,
  isLocalHost,
  normalizeComfyTarget,
  parseDataUrl
} from "../src/services/comfy.js";

const sampleWorkflow = {
  "23": {
    inputs: { seed: 1, steps: 20 }
  },
  "14": {
    inputs: {
      "resize_type.longer_size": 1024
    }
  }
};

test("resolveWorkflowInput maps node-field ids", () => {
  const result = resolveWorkflowInput(sampleWorkflow, "23-seed");
  assert.equal(result.field, "seed");
  assert.equal(result.section, "inputs");
});

test("resolveWorkflowInput maps dotted field ids", () => {
  const result = resolveWorkflowInput(sampleWorkflow, "14-resize_type.longer_size");
  assert.equal(result.field, "resize_type.longer_size");
  assert.equal(result.section, "inputs");
});

test("resolveWorkflowInput throws for missing node", () => {
  assert.throws(
    () => resolveWorkflowInput(sampleWorkflow, "99-seed"),
    /Workflow node not found/
  );
});

test("isLocalHost recognizes loopback and private ranges", () => {
  assert.equal(isLocalHost("127.0.0.1"), true);
  assert.equal(isLocalHost("localhost"), true);
  assert.equal(isLocalHost("192.168.1.10"), true);
  assert.equal(isLocalHost("example.com"), false);
});

test("normalizeComfyTarget upgrades remote http to https", () => {
  const target = normalizeComfyTarget("http://example.com:8188");
  assert.equal(target.httpBase, "https://example.com:8188");
  assert.equal(target.wsBase, "wss://example.com:8188");
});

test("normalizeComfyTarget keeps local http", () => {
  const target = normalizeComfyTarget("127.0.0.1:8188");
  assert.equal(target.httpBase, "http://127.0.0.1:8188");
  assert.equal(target.wsBase, "ws://127.0.0.1:8188");
});

test("parseDataUrl extracts mime and payload", () => {
  const parsed = parseDataUrl("data:image/png;base64,QUJD");
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.base64, "QUJD");
});
