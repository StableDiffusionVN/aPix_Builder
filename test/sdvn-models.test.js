import { describe, expect, test } from "vitest";
import { sdvnModelFieldsFromWorkflow } from "../server/lib/templateService.js";
import { fieldChoicesWithSdvn, sdvnFieldPending } from "../src/lib/sdvnModels.js";

const workflow = {
  "5": { class_type: "SDVN Load Lora" },
  "7": { class_type: "LoraLoader" },
  "9": { class_type: "SDVN Checkpoint Loader" }
};

describe("sdvnModelFieldsFromWorkflow (per-field)", () => {
  test("chỉ field trỏ node SDVN mới vào map; node loader thường bị loại", () => {
    const config = {
      input: {
        loraSdvn: { id: "5-lora_name", ui: { type: "loras" } },
        loraPlain: { id: "7-lora_name", ui: { type: "loras" } },
        ckpt: { id: "9-ckpt_name", ui: { type: "checkpoint" } }
      }
    };
    expect(sdvnModelFieldsFromWorkflow(config, workflow)).toEqual({
      "5-lora_name": "loras",
      "9-ckpt_name": "checkpoints"
    });
  });

  test("KHÔNG suy từ tên widget: field menu trỏ node SDVN không vào map", () => {
    const config = {
      input: { menuField: { id: "5-lora_name", ui: { type: "menu", choices: ["a"] } } }
    };
    expect(sdvnModelFieldsFromWorkflow(config, workflow)).toEqual({});
  });

  test("id dạng mảng dùng join('|') làm key (khớp normalizeId client)", () => {
    const config = {
      input: { lora: { id: ["5-lora_name", "9-extra"], ui: { type: "lora" } } }
    };
    expect(sdvnModelFieldsFromWorkflow(config, workflow)).toEqual({
      "5-lora_name|9-extra": "loras"
    });
  });

  test("KHÔNG duyệt field con menu-sub (top-level-only, thống nhất iOS/Android)", () => {
    const config = {
      input: {
        mode: {
          ui: {
            type: "menu-sub",
            choices: ["A:a"],
            sub: { a: { subLora: { id: "5-lora_name", ui: { type: "lora" } } } }
          }
        }
      }
    };
    expect(sdvnModelFieldsFromWorkflow(config, workflow)).toEqual({});
  });
});

describe("fieldChoicesWithSdvn (per-field merge)", () => {
  const discovery = { sdvnExtras: { "5-lora_name": ["sdvn-a.safetensors", "sdvn-b.safetensors"] } };

  test("field có extras: None đầu, server trước, SDVN sau, khử trùng lặp", () => {
    expect(fieldChoicesWithSdvn(discovery, ["local.safetensors", "sdvn-a.safetensors"], "5-lora_name"))
      .toEqual(["None", "local.safetensors", "sdvn-a.safetensors", "sdvn-b.safetensors"]);
  });

  test("field khác giữ nguyên danh sách server", () => {
    const base = ["local.safetensors"];
    expect(fieldChoicesWithSdvn(discovery, base, "7-lora_name")).toBe(base);
    expect(fieldChoicesWithSdvn(null, base, "5-lora_name")).toBe(base);
    expect(fieldChoicesWithSdvn(discovery, base, "")).toBe(base);
  });
});

describe("sdvnFieldPending (guard chống race discovery cũ)", () => {
  const fields = { "5-lora_name": "loras" };

  test("field trong map nhưng discovery chưa có entry → pending (không reset value)", () => {
    expect(sdvnFieldPending(null, fields, "5-lora_name")).toBe(true);
    expect(sdvnFieldPending({ sdvnExtras: { "9-other": [] } }, fields, "5-lora_name")).toBe(true);
  });

  test("entry đã có (kể cả rỗng khi thư viện tải fail) → hết pending", () => {
    expect(sdvnFieldPending({ sdvnExtras: { "5-lora_name": [] } }, fields, "5-lora_name")).toBe(false);
    expect(sdvnFieldPending({ sdvnExtras: { "5-lora_name": ["a"] } }, fields, "5-lora_name")).toBe(false);
  });

  test("field không thuộc map → không bao giờ pending", () => {
    expect(sdvnFieldPending(null, fields, "7-lora_name")).toBe(false);
    expect(sdvnFieldPending(null, null, "5-lora_name")).toBe(false);
  });
});
