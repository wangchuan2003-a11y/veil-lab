import { test, expect } from "@playwright/test";
test("invalid assumptions preserve every displayed result", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-rule="needs"]').click();
  const results = page.locator(
    '#assumption-rows td[id^="allocation-"], #assumption-rows td[id^="coverage-"], #assumption-rows td[id^="outcome-"]',
  );
  await expect(results).toHaveCount(18);
  const before = await results.allTextContents();
  expect(before.every((value) => value.trim().length > 0)).toBe(true);
  for (const [selector, invalid, original] of [
    ['[data-need="0"]', "", "10"],
    ['[data-need="0"]', "61", "10"],
    ['[data-return="0"]', "", "0.8"],
    ['[data-return="0"]', "3.1", "0.8"],
  ]) {
    const input = page.locator(selector);
    await input.fill(invalid);
    await input.press("Tab");
    await expect(page.locator("#status")).toContainText("当前模型未改变");
    await expect(input).toHaveValue(original);
    await expect(results).toHaveText(before);
  }
});

test("rules, reveal, changed assumptions and zero budget work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".person")).toHaveCount(6);
  await expect(page.locator("#gini")).toHaveText("0.000");
  await page.locator('[data-rule="floor"]').click();
  await expect(page.locator("#floor")).toHaveText("128.6%");
  await page.locator("#reveal").click();
  await expect(page.locator(".person.is-you")).toHaveCount(1);
  await expect(page.locator("#reveal-result")).toContainText("你在位置");
  await page.locator("#budget-number").fill("0");
  await page.locator("#budget-number").press("Tab");
  await expect(page.locator("#floor")).toHaveText("0%");
  await expect(page.locator("#gini")).toHaveText("未定义");
  await expect(page.locator(".person.is-you")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("keyboard controls and symmetric assumptions preserve equal results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-preset="symmetric"]').click();
  const total = page.locator('[data-rule="total"]');
  await total.focus();
  await page.keyboard.press("Enter");
  await expect(total).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#gini")).toHaveText("0.000");
  await page.getByRole("spinbutton", { name: "位置 A 基本需求" }).fill("60");
  await page.keyboard.press("Tab");
  await expect(page.locator("#coverage-0")).toHaveText("50%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("sharing falls back to the address bar and restores the full model", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    }),
  );
  await page.goto("/");
  await page.locator('[data-rule="needs"]').click();
  await page.locator("#share").click();
  await expect(page.locator("#status")).toContainText("手动复制");
  expect(new URL(page.url()).hash).toMatch(/^#v1\./);
  await page.reload();
  await expect(page.locator('[data-rule="needs"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#veil-state")).toContainText("尚未揭晓");
});
test("JSON download imports and invalid JSON preserves the experiment", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#export").click();
  const download = await downloadEvent;
  const file = testInfo.outputPath("experiment.json");
  await download.saveAs(file);
  await page.locator("#budget-number").fill("0");
  await page.locator("#budget-number").press("Tab");
  await page.locator("#file").setInputFiles(file);
  await expect(page.locator("#budget-number")).toHaveValue("180");
  await page
    .locator("#file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":100}'),
    });
  await expect(page.locator("#status")).toContainText("无效");
  await expect(page.locator("#budget-number")).toHaveValue("180");
});
