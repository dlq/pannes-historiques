import { expect, test } from "@playwright/test";

test("data dialog wraps keyboard focus and restores its opener", async ({ page }) => {
  await page.goto("/?lang=en");
  const opener = page.locator("[data-layer-info]").first();
  await opener.press("Enter");
  const dialog = page.locator("#sheet-provenance");
  const close = dialog.locator("[data-detail-close]");
  await expect(close).toBeFocused();
  await expect(dialog).toContainText("The Archive summary refreshes separately");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator("a").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const lang of ["fr", "en"]) {
  test(`disclosure details retain long content without horizontal scrolling (${lang})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/?lang=${lang}&domain=context`);
    await page.evaluate(() => customElements.whenDefined("dai-detail-panel").then(() => undefined));
    // Expand the real mobile sheet before exercising the renderer in isolation.
    const sheet = page.locator(".ph-sheet");
    await page.locator(".ph-sheet-grabber").click();
    await expect(sheet).toHaveAttribute("data-detent", "half");
    await page.locator(".ph-sheet-grabber").click();
    await expect(sheet).toHaveAttribute("data-detent", "full");
    const panel = page.locator("dai-detail-panel");
    // Exercise the production renderer with a dense disclosure, without changing service data.
    await panel.evaluate((node) =>
      (node as HTMLElement & { renderDisclosure(item: unknown): void }).renderDisclosure({
        label: "Sainte-Marguerite-du-Lac-Masson — secteur de distribution municipal",
        recordCount: 4,
        sourceDais: ["DAI-2025-0275-Annexe-Complementaire-Distribution-Regionale"],
        startMin: "2022-01-12",
        startMax: "2025-09-03",
        topCauses: [{ cause: "Vegetation", count: 4 }],
        recentEvents: [
          {
            start_time: "2025-09-03T18:22:00",
            end_time: "2025-09-04T21:10:00",
            cause: "Vegetation",
            row_area: "Sainte-Marguerite-du-Lac-Masson",
            customers_affected: 84,
          },
        ],
      }),
    );
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const title = panel.locator(".ph-sheet-title");
    await expect(title).toContainText("Sainte-Marguerite-du-Lac-Masson");
    expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(panel.locator("[data-dai-detail-close]")).toBeVisible();
    await panel.screenshot({ path: test.info().outputPath(`dense-${lang}.png`) });
    await panel.locator(".ph-row-list").last().scrollIntoViewIfNeeded();
    await panel.screenshot({ path: test.info().outputPath(`dense-${lang}-rows.png`) });
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}
