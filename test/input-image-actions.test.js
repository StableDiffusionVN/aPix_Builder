import { afterEach, describe, expect, test, vi } from "vitest";
import {
  loadInputImageFromUrl,
  makeInputImageValue,
  uploadInputImageDataUrl
} from "../src/lib/inputImageActions.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("input image actions", () => {
  test("makeInputImageValue normalizes library images", () => {
    expect(makeInputImageValue({ name: "a b.png" })).toEqual({
      kind: "input-image",
      name: "a b.png",
      url: "/api/input-image?name=a%20b.png"
    });
  });

  test("uploadInputImageDataUrl maps server image to input value and updates cache owner", async () => {
    const updateInputImages = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        images: [{ name: "new.png" }],
        image: { name: "new.png" }
      })
    })));

    await expect(uploadInputImageDataUrl("data:image/png;base64,abc", {
      filename: "new.png",
      updateInputImages
    })).resolves.toEqual({
      kind: "input-image",
      name: "new.png",
      url: "/api/input-image?name=new.png"
    });
    expect(updateInputImages).toHaveBeenCalledWith([{ name: "new.png" }]);
  });

  test("loadInputImageFromUrl maps imported URLs into input values", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        images: [{ name: "remote.png" }],
        image: { name: "remote.png" }
      })
    })));

    await expect(loadInputImageFromUrl("https://example.test/remote.png")).resolves.toEqual({
      kind: "input-image",
      name: "remote.png",
      url: "/api/input-image?name=remote.png"
    });
  });
});
