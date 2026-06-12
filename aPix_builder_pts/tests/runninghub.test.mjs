import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRunningHubWorkflowId,
  inferRunningHubFieldType,
  isRunningHubWfTemplate,
  parseWorkflowFieldId,
  payloadToRunningHubNodes,
  runningHubTaskOptions,
  usesSavedWorkflowJson
} from "../src/services/runninghub.js";

test("parseWorkflowFieldId supports node-inputs-field ids", () => {
  assert.deepEqual(parseWorkflowFieldId("14-inputs-resize_type.longer_size"), {
    nodeId: "14",
    fieldName: "resize_type.longer_size"
  });
  assert.deepEqual(parseWorkflowFieldId("48-image"), {
    nodeId: "48",
    fieldName: "image"
  });
});

test("payloadToRunningHubNodes infers image field types", () => {
  const nodes = payloadToRunningHubNodes({
    "48-image": "data:image/png;base64,abc",
    "49-value": "hello",
    "51-value": 2048
  });
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].fieldType, "IMAGE");
  assert.equal(nodes[1].fieldType, "STRING");
  assert.equal(nodes[2].fieldType, "INT");
});

test("isRunningHubWfTemplate detects runninghub.workflowId", () => {
  assert.equal(isRunningHubWfTemplate({ runninghub: { workflowId: "123" } }), true);
  assert.equal(isRunningHubWfTemplate({ app: { name: "Local" } }), false);
});

test("usesSavedWorkflowJson follows saveWorkflowJson flag", () => {
  assert.equal(usesSavedWorkflowJson({ runninghub: { saveWorkflowJson: false } }, true), false);
  assert.equal(usesSavedWorkflowJson({ runninghub: { saveWorkflowJson: true } }, false), true);
  assert.equal(usesSavedWorkflowJson({}, true), true);
  assert.equal(usesSavedWorkflowJson({}, false), false);
});

test("runningHubTaskOptions maps optional task flags", () => {
  assert.deepEqual(runningHubTaskOptions({
    runninghub: {
      addMetadata: true,
      usePersonalQueue: true,
      accessPassword: " secret "
    }
  }), {
    addMetadata: true,
    accessPassword: "secret",
    usePersonalQueue: true
  });
});

test("extractRunningHubWorkflowId reads yaml raw fallback", () => {
  const raw = 'runninghub:\n  workflowId: "2064644362323189762"';
  assert.equal(
    extractRunningHubWorkflowId(raw, { runninghub: { workflowId: "" } }),
    "2064644362323189762"
  );
});

test("inferRunningHubFieldType handles upload objects", () => {
  assert.equal(inferRunningHubFieldType("image", { kind: "upload", blob: {} }), "IMAGE");
});
