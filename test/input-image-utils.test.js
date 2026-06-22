import { describe, expect, test } from "vitest";
import {
  compareInputImagesNewestFirst,
  filterInputLibraryImages,
  inferInputImageDate
} from "../src/lib/inputImageUtils.js";

describe("input image library ordering", () => {
  test("prefers modifiedAt as the input-library date", () => {
    const image = {
      name: "old-name_1000000000000.png",
      createdAt: "2024-01-01T00:00:00.000Z",
      modifiedAt: "2024-02-01T00:00:00.000Z"
    };

    expect(inferInputImageDate(image).toISOString()).toBe("2024-02-01T00:00:00.000Z");
  });

  test("sorts newest input images first by modifiedAt", () => {
    const images = [
      { name: "a.png", modifiedAt: "2024-01-01T00:00:00.000Z" },
      { name: "b.png", modifiedAt: "2024-03-01T00:00:00.000Z" },
      { name: "c.png", modifiedAt: "2024-02-01T00:00:00.000Z" }
    ];

    expect([...images].sort(compareInputImagesNewestFirst).map(image => image.name)).toEqual([
      "b.png",
      "c.png",
      "a.png"
    ]);
  });

  test("filterInputLibraryImages keeps newest-first order by default", () => {
    const images = [
      { name: "old.png", modifiedAt: "2024-01-01T00:00:00.000Z" },
      { name: "new.png", modifiedAt: "2024-02-01T00:00:00.000Z" }
    ];

    expect(filterInputLibraryImages(images).map(image => image.name)).toEqual([
      "new.png",
      "old.png"
    ]);
  });
});
