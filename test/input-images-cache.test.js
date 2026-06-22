import { describe, expect, test, vi } from "vitest";
import {
  fetchInputImages,
  getCachedInputImages,
  isInputImagesCacheFresh,
  setCachedInputImages
} from "../src/lib/inputImagesCache.js";

describe("inputImagesCache", () => {
  test("dedupes concurrent fetches", async () => {
    setCachedInputImages([]);
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      fetchCount += 1;
      return {
        ok: true,
        json: async () => ({ images: [{ name: "a.png", url: "/api/input-image?name=a.png" }] })
      };
    });

    const [first, second] = await Promise.all([
      fetchInputImages({ force: true }),
      fetchInputImages({ force: true })
    ]);

    expect(first).toEqual(second);
    expect(fetchCount).toBe(1);
    globalThis.fetch = originalFetch;
  });

  test("returns cached images without refetching while fresh", async () => {
    setCachedInputImages([{ name: "cached.png", url: "/api/input-image?name=cached.png" }]);
    expect(isInputImagesCacheFresh()).toBe(true);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    const images = await fetchInputImages({ force: false });
    expect(images).toEqual(getCachedInputImages());
    expect(globalThis.fetch).not.toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });
});
