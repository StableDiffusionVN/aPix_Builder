import { describe, expect, test } from "vitest";
import { selectWorkflowVariant, assertApiWorkflow, validateVariantFile } from "../shared/workflowVariants.js";
import { validateWorkflowVariants } from "../server/lib/workflowVariants.js";
import { mapValuesToRequest, setWorkflowValue } from "../server/lib/workflowPatcher.js";
import { requestPayload, flattenInputs } from "../src/lib/template.js";

const main = {
  1: { class_type: "Text", inputs: { text: "main" } },
  9: { class_type: "SaveImage", inputs: { images: ["1", 0] } }
};
const alternate = {
  20: { class_type: "Text", inputs: { prompt: "alternate" } },
  99: { class_type: "SaveImage", inputs: { images: ["20", 0] } }
};
function fixture() {
  return {
    app: { name: "Multiple JSONs" },
    input: { mode: { ui: {
      type: "menu-sub", menuLabelSyntax: true, choices: ["Main:a", "Alternate:b"], value: "a",
      sub: { a: { prompt: { id: "1-text", ui: { type: "text" } } }, b: { prompt: { id: "20-prompt", ui: { type: "text" } } } },
      workflows: { b: { file: "workflows/alternate.json", outputNodeId: "99" } }
    } } },
    output: { result: { id: "9", ui: { type: "image" } } }
  };
}

describe("menu-sub workflow variants", () => {
  test("ordinary templates retain their config and main workflow", () => {
    const config = { input: {}, output: {} };
    expect(selectWorkflowVariant(config)).toEqual({ config, file: null, choice: null });
  });
  test("default and unmapped options use the main JSON and only active inputs", () => {
    const selected = selectWorkflowVariant(fixture());
    expect(selected.file).toBeNull();
    expect(Object.keys(selected.config.input.mode.ui.sub)).toEqual(["a"]);
    expect(selected.config.output.result.id).toBe("9");
  });
  test.each(["b", "Alternate", "Alternate:b"])("selects the branch by stored value %s", value => {
    const selected = selectWorkflowVariant(fixture(), { __menu__mode: value });
    expect(selected.file).toBe("workflows/alternate.json");
    expect(selected.config.output.result.id).toBe("99");
    expect(Object.keys(selected.config.input.mode.ui.sub)).toEqual(["b"]);
  });
  test("accepts selectors mapped to an actual node field", () => {
    const config = fixture(); config.input.mode.id = "2-mode";
    expect(selectWorkflowVariant(config, { "2-mode": "b" }).file).toBe("workflows/alternate.json");
  });
  test("validates disjoint branch node IDs against their own JSONs", () => {
    expect(() => validateWorkflowVariants(fixture(), main, { "workflows/alternate.json": alternate })).not.toThrow();
    const broken = fixture(); broken.input.mode.ui.sub.b.prompt.id = "777-text";
    expect(() => validateWorkflowVariants(broken, main, { "workflows/alternate.json": alternate })).toThrow(/Alternate.*777/);
  });
  test("submits only active fields and patches the selected graph", async () => {
    const config = fixture();
    const values = { __menu__mode: "b", "1-text": "ignore", "20-prompt": "chosen prompt" };
    const selected = selectWorkflowVariant(config, values);
    const payload = requestPayload(flattenInputs(config.input), values);
    const request = mapValuesToRequest(selected.config, payload);
    expect(request).toEqual({ "20-prompt": "chosen prompt" });
    const graph = structuredClone(alternate);
    await setWorkflowValue(graph, "20-prompt", request["20-prompt"], {}, null);
    expect(graph[20].inputs.prompt).toBe("chosen prompt");
    expect(main[1].inputs.text).toBe("main");
  });
  test("supports a workflow option with no runtime inputs", () => {
    const config = fixture(); config.input.mode.ui.sub.b = {};
    const selected = selectWorkflowVariant(config, { __menu__mode: "b" });
    expect(selected.choice).toBe("b");
    expect(mapValuesToRequest(selected.config, { __menu__mode: "b" })).toEqual({});
    expect(() => validateWorkflowVariants(config, main, { "workflows/alternate.json": alternate })).not.toThrow();
  });
  test("rejects missing JSONs, invalid selections and incorrect output IDs", () => {
    expect(() => validateWorkflowVariants(fixture(), main, {})).toThrow(/API/);
    expect(() => selectWorkflowVariant(fixture(), { __menu__mode: "unknown" })).toThrow(/không hợp lệ/);
    const config = fixture(); config.input.mode.ui.workflows.b.outputNodeId = "777";
    expect(() => validateWorkflowVariants(config, main, { "workflows/alternate.json": alternate })).toThrow(/777/);
  });
  test("rejects unsafe paths and non-API JSON before saving", () => {
    for (const file of ["../outside.json", "/tmp/file.json", "workflows/../api.json", "workflows/nested/x.json"]) {
      expect(() => validateVariantFile(file)).toThrow(/không hợp lệ/);
    }
    expect(() => assertApiWorkflow({ nodes: [], links: [] })).toThrow(/API/);
    expect(() => assertApiWorkflow([])).toThrow(/API/);
    expect(assertApiWorkflow(alternate)).toBe(alternate);
  });
  test("rejects ambiguous routing menus", () => {
    const config = fixture(); config.input.second = structuredClone(config.input.mode);
    expect(() => selectWorkflowVariant(config)).toThrow(/một menu/);
  });
});

// Exercise disk persistence using the same service used by both execution providers.
describe("stored workflow variants", () => {
  test("loads branch files after reopening and resolves local and RH workflow templates", async () => {
    const { mkdtemp, mkdir, writeFile, rm, readFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const YAML = await import("yaml");
    const { createTemplateService } = await import("../server/lib/templateService.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "apix-workflow-options-"));
    try {
      for (const scope of ["templates", "templates-rh"]) {
        const dir = path.join(root, scope, "multi");
        await mkdir(path.join(dir, "workflows"), { recursive: true });
        const config = fixture();
        if (scope === "templates-rh") config.runninghub = { workflowId: "123", saveWorkflowJson: true };
        await writeFile(path.join(dir, "app_build.yaml"), YAML.stringify(config));
        await writeFile(path.join(dir, "api.json"), JSON.stringify(main));
        await writeFile(path.join(dir, "workflows/alternate.json"), JSON.stringify(alternate));
      }
      const service = createTemplateService({ configDir: root });
      for (const scope of ["local", "runninghub-wf"]) {
        const loaded = await service.loadConfig("multi", scope);
        const files = await service.readWorkflowFiles(loaded.config, loaded.template);
        expect(files["workflows/alternate.json"]).toEqual(alternate);
        validateWorkflowVariants(loaded.config, main, files, { requireOutput: scope === "local" });
        const branch = await service.resolveWorkflow(loaded.config, loaded.template, { __menu__mode: "b" });
        expect(JSON.parse(await readFile(branch.template.workflowPath, "utf8"))).toEqual(alternate);
        expect(branch.config.output.result.id).toBe("99");
        const base = await service.resolveWorkflow(loaded.config, loaded.template, { __menu__mode: "a" });
        expect(JSON.parse(await readFile(base.template.workflowPath, "utf8"))).toEqual(main);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

test("Shortcut export rejects option JSONs rather than silently exporting the main graph", async () => {
  const { buildRunningHubShortcut } = await import("../electron/runninghub-shortcut.mjs");
  expect(() => buildRunningHubShortcut({}, fixture(), "test-key")).toThrow(/Shortcut chưa hỗ trợ/);
});
