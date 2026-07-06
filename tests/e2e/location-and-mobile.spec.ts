import { expect, test } from "@playwright/test";

test.use({
  geolocation: { latitude: 45.5186, longitude: -73.6027 },
  permissions: ["geolocation"],
});

test("current location search opens the overview with coordinates in the URL", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  const locationButton = page.getByRole("button", { name: "Use current location" });
  await expect(locationButton.locator("svg")).toHaveCount(1);

  const sheetResponse = page.waitForResponse(
    (response) => response.url().includes("/sheet") && response.url().includes("lat="),
  );
  await locationButton.click();
  await sheetResponse;

  await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
  await expect(page).toHaveURL(/lat=45\.5186/);
  await expect(page).toHaveURL(/lon=-73\.6027/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page.locator(".ph-sheet-title")).toBeVisible();

  await page.reload();
  await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
  await expect(page.locator(".ph-hero-card")).toBeVisible();
});

test("mobile sheet starts at peek and expands through detents", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  const sheet = page.locator(".ph-sheet");
  const grabber = page.locator(".ph-sheet-grabber");

  await expect(page.locator(".ph-segmented")).toBeVisible();

  if ((viewport?.width || 0) >= 768) {
    await expect(grabber).toBeHidden();
    return;
  }

  await expect(grabber).toBeVisible();
  await expect(sheet).toHaveAttribute("data-detent", "peek");
  const initialHeight = await sheet.evaluate((node) => node.getBoundingClientRect().height);

  await grabber.click();
  await expect(sheet).toHaveAttribute("data-detent", "half");
  await expect
    .poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThan(initialHeight + 80);

  const box = await grabber.boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, viewport.height * 0.1, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-detent", "full");
});

test("mobile row selection keeps the map visible at half detent", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) >= 768) return;

  const sheet = page.locator(".ph-sheet");
  await page.locator(".ph-sheet-grabber").click();
  await page.locator(".ph-sheet-grabber").click();
  await expect(sheet).toHaveAttribute("data-detent", "full");

  const firstRow = page.locator("[data-map-focus]").first();
  await firstRow.click();
  await expect(firstRow).toHaveClass(/is-map-selected/);
  await expect(sheet).toHaveAttribute("data-detent", "half");
  await expect(page.locator("outage-map")).toHaveAttribute("data-active-focus-kind", "outage");
});

test("mobile address search keeps the sheet at half with the answer visible", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) >= 768) return;

  await page.locator("#address-input").fill("5220 Rue Jeanne-Mance");
  const sheetResponse = page.waitForResponse((response) =>
    response.url().includes("domain=overview"),
  );
  await page.locator("#address-input").press("Enter");
  await sheetResponse;

  await expect(page.locator(".ph-sheet")).toHaveAttribute("data-detent", "half");
  await expect(page.locator(".ph-sheet-title")).toBeVisible();
  await expect(page.locator(".ph-status-line").first()).toBeVisible();

  const sheetTop = await page
    .locator(".ph-sheet")
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(sheetTop).toBeGreaterThan((viewport?.height || 0) * 0.3);
});
