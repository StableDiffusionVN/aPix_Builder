import { describe, expect, test } from "vitest";
import { buildValues, describeFields, maskAddress } from "../mcp/apixClient.mjs";

const INPUT = {
  menu: {
    ui: {
      type: "menu-sub",
      label: "Menu",
      choices: ["Auto", "+ Upscale"],
      value: "Auto",
      sub: {
        Auto: {},
        "+ Upscale": {
          menu: { id: "88-Menu", ui: { type: "menu", label: "Menu", choices: ["2048:2048", "3800:3800"], menuLabelSyntax: true, value: "2048" } }
        }
      }
    }
  },
  image_swap: { id: "547-image", ui: { type: "image", label: "Image Swap" } },
  mask_expand: { id: "601-num", ui: { type: "int", label: "Mask Expand", value: 4 } },
  seed: { id: "498-seed", ui: { type: "seed", label: "Seed", value: "random_seed" } }
};

const asInput = async value => ({ kind: "input-image", name: value });

describe("apix MCP client", () => {
  test("maps friendly keys, menu-sub choice and its sub-fields to field ids", async () => {
    const values = await buildValues(INPUT, { menu: "+ Upscale", "menu.menu": "3800", image_swap: "a.png", seed: 7 }, asInput);
    expect(values).toEqual({
      __menu__menu: "+ Upscale",
      "88-Menu": "3800",
      "547-image": { kind: "input-image", name: "a.png" },
      "601-num": 4,
      "498-seed": 7
    });
  });

  test("defaults: first menu choice, random seed; accepts labels", async () => {
    const values = await buildValues(INPUT, { "Image Swap": "b.png", "Mask Expand": "6" }, asInput);
    expect(values.__menu__menu).toBe("Auto");
    expect(values["88-Menu"]).toBeUndefined();
    expect(values["601-num"]).toBe(6);
    expect(values["498-seed"]).toBe("random_seed");
  });

  test("rejects unknown fields and invalid choices", async () => {
    await expect(buildValues(INPUT, { nope: 1 }, asInput)).rejects.toThrow(/nope/);
    await expect(buildValues(INPUT, { menu: "Zoom" }, asInput)).rejects.toThrow(/Zoom/);
    await expect(buildValues(INPUT, { mask_expand: "abc" }, asInput)).rejects.toThrow(/số/);
  });

  test("describes fields with sub-fields per choice", () => {
    const fields = describeFields(INPUT);
    expect(fields[0]).toMatchObject({ key: "menu", type: "menu-sub", choices: ["Auto", "+ Upscale"] });
    expect(fields[0].subFields["+ Upscale"][0]).toMatchObject({ key: "menu", id: "88-Menu", choices: ["2048", "3800"] });
  });

  test("masks credentials in server addresses", () => {
    expect(maskAddress("https://user:secret@colab.example")).toBe("https://***@colab.example");
    expect(maskAddress("http://127.0.0.1:8188")).toBe("http://127.0.0.1:8188");
  });
});
