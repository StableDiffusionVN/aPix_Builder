import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = join(root, "website", "screenshots");
const baseUrl = process.env.APIX_SCREENSHOT_URL ?? "http://127.0.0.1:8787/";

async function waitForApp(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".appShell", { timeout: 120_000 });
  await page.waitForTimeout(1200);
}

async function setTheme(page, theme) {
  await page.evaluate(t => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, type: "png", fullPage: false });
  console.log(`saved ${path}`);
}

async function clickTopBarButton(page, labelPart) {
  const btn = page.locator(".appTopBarButton").filter({ has: page.locator(`[aria-label*="${labelPart}"], [title*="${labelPart}"]`) }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(600);
    return true;
  }
  const fallback = page.locator(".appTopBarButton").nth(labelPart === "info" ? 2 : 1);
  if (await fallback.count()) {
    await fallback.click();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await waitForApp(page);

  await setTheme(page, "dark");
  await shot(page, "overview-dark");

  await setTheme(page, "light");
  await shot(page, "overview-light");

  await setTheme(page, "dark");

  await page.locator('.appTopBarButton[aria-label*="info" i], .appTopBarButton[aria-label*="Info" i], .appTopBarButton[aria-label*="Thông tin" i]').last().click();
  await page.waitForSelector(".infoModal", { timeout: 10_000 });
  await shot(page, "info-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await page.locator('.appTopBarButton[aria-label*="settings" i], .appTopBarButton[aria-label*="Settings" i], .appTopBarButton[aria-label*="Cài đặt" i]').first().click();
  await page.waitForSelector(".appSettingsModal", { timeout: 10_000 });
  await shot(page, "settings-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await setTheme(page, "light");
  await page.locator('.appTopBarButton[aria-label*="settings" i], .appTopBarButton[aria-label*="Settings" i], .appTopBarButton[aria-label*="Cài đặt" i]').first().click();
  await page.waitForSelector(".appSettingsModal", { timeout: 10_000 });
  await shot(page, "settings-modal-light");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const editTemplate = page.locator("button").filter({ hasText: /Edit template|Chỉnh sửa template|Sửa template/i }).first();
  if (await editTemplate.count()) {
    await editTemplate.click();
    await page.waitForSelector(".templateEditorModal", { timeout: 10_000 });
    await shot(page, "template-editor");
    await page.keyboard.press("Escape");
  }

  await browser.close();
  await writeFile(join(outDir, ".generated"), new Date().toISOString());
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
