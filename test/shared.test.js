import { expect, test } from "vitest";
import {
  lookupMenuSubFields,
  menuChoiceOptions,
  parseMenuChoices,
  resolveMenuStoredValue
} from "../shared/menuChoices.js";
import {
  isHttpImageUrl,
  isLocalFolderPath,
  normalizeLocalPathInput
} from "../shared/localImagePath.js";

test("menu choices preserve labels and API values", () => {
  const source = { menuLabelSyntax: true };
  const options = menuChoiceOptions(source);
  expect(parseMenuChoices(["Nhanh:fast", "Chậm:slow"], options)).toEqual([
    { label: "Nhanh", value: "fast", raw: "Nhanh:fast" },
    { label: "Chậm", value: "slow", raw: "Chậm:slow" }
  ]);
  expect(resolveMenuStoredValue("Nhanh", source.choices, options)).toBe("Nhanh");
  expect(
    lookupMenuSubFields({ fast: { steps: 4 } }, "Nhanh:fast", ["Nhanh:fast"], options),
  ).toEqual({ steps: 4 });
});

test("local image paths normalize file URLs and reject web URLs", () => {
  expect(normalizeLocalPathInput("'~/Pictures/'")).toBe("~/Pictures");
  expect(normalizeLocalPathInput("file:///C:/Images/")).toBe("C:/Images");
  expect(
    normalizeLocalPathInput("file:///C:/Images/", { windowsFileUrl: true }),
  ).toBe("C:\\Images");
  expect(isLocalFolderPath("~/Pictures")).toBe(true);
  expect(isLocalFolderPath("https://example.com/image.png")).toBe(false);
  expect(isHttpImageUrl("https://example.com/image.png")).toBe(true);
});
