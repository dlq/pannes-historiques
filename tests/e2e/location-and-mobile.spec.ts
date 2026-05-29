import { expect, test } from "@playwright/test";

test.use({
  geolocation: { latitude: 45.5186, longitude: -73.6027 },
  permissions: ["geolocation"],
});

test("current location search renders deterministic results", async ({ page }) => {
  await page.goto("/?lang=en");
  const locationButton = page.getByRole("button", { name: "Use current location" });
  await expect(locationButton.locator("svg")).toHaveCount(1);

  await locationButton.click();

  await expect(
    page.getByRole("heading", { name: "Current or new outages" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/lat=45\.5186/);
  await expect(page).toHaveURL(/lon=-73\.6027/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page.locator("#address-input")).toHaveValue(/Current location/);
  await expect(page.locator("outage-map")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Current or new outages" }),
  ).toBeVisible();
  await expect(page.locator("#address-input")).toHaveValue(/Current location/);

  await page.getByRole("button", { name: "fr" }).click();
  await expect(page).toHaveURL(/lang=fr/);
  await expect(page).toHaveURL(/lat=45\.5186/);
  await expect(page).toHaveURL(/lon=-73\.6027/);
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(
    page.getByRole("heading", { name: "Pannes actuelles ou nouvelles" }),
  ).toBeVisible();
  const frenchLocationButton = page.getByRole("button", {
    name: "Utiliser ma position actuelle",
  });
  await expect(frenchLocationButton.locator("svg")).toHaveCount(1);
  await expect(frenchLocationButton.locator(".ph-button-spinner")).toHaveCount(0);
});

test("mobile default context panel is visible and resizable", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  const panel = page.locator("#results");
  const handle = page.locator(".ph-panel-drawer-handle");

  await expect(page.getByRole("heading", { name: "Current or new outages" })).toBeVisible();

  if ((viewport?.width || 0) >= 768) {
    await expect(handle).toBeHidden();
    return;
  }

  await expect(handle).toBeVisible();
  await expect(page.locator(".ph-default-context-list")).toBeVisible();
  await expect(page.locator(".ph-context-switcher")).toHaveCount(0);
  const initialHeight = await panel.evaluate((node) => node.getBoundingClientRect().height);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 120);
  await page.mouse.up();

  await expect
    .poll(() => panel.evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThan(initialHeight + 40);

  await expect(panel).toHaveClass(/is-expanded/);
  await expect
    .poll(() =>
      panel.evaluate((node) => {
        const panelTop = node.getBoundingClientRect().top;
        const topbarBottom =
          document.querySelector(".ph-topbar")?.getBoundingClientRect().bottom || 0;
        return panelTop - topbarBottom;
      }),
    )
    .toBeGreaterThan(120);

  await expect
    .poll(() =>
      panel.evaluate((node) => {
        const panelRect = node.getBoundingClientRect();
        const currentSummary = node.querySelector("#ph-context-current summary")?.getBoundingClientRect();
        if (!currentSummary) return false;
        return currentSummary.top >= panelRect.top && currentSummary.bottom <= panelRect.bottom;
      }),
    )
    .toBe(true);
});

test("mobile map item details appear as a bottom overlay sheet", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) >= 768) return;

  const firstContextRow = page.locator("[data-map-focus]").first();
  await expect(firstContextRow).toBeVisible();
  await firstContextRow.click();

  const detailPanel = page.locator("dai-detail-panel");
  await expect(detailPanel).toBeVisible();
  await expect
    .poll(() =>
      detailPanel.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottomGap: Math.round(window.innerHeight - rect.bottom),
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        };
      }),
    )
    .toMatchObject({
      bottomGap: expect.any(Number),
      height: expect.any(Number),
      top: expect.any(Number),
    });

  const geometry = await detailPanel.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - rect.bottom,
      height: rect.height,
      top: rect.top,
    };
  });
  expect(geometry.bottomGap).toBeLessThan(40);
  expect(geometry.height).toBeLessThan((viewport?.height || 0) * 0.62);
  expect(geometry.top).toBeGreaterThan((viewport?.height || 0) * 0.3);
});

test("mobile search centers the address without left-rail compensation", async ({ page }) => {
  await page.goto("/?lang=en");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) >= 768) return;

  await page.locator("#address-input").fill("5220 Rue Jeanne-Mance");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();

  const markerBox = await page.locator(".leaflet-marker-icon").first().boundingBox();
  expect(markerBox).not.toBeNull();
  if (!markerBox || !viewport) return;

  const markerCenterX = markerBox.x + markerBox.width / 2;
  expect(markerCenterX).toBeGreaterThan(viewport.width * 0.35);
  expect(markerCenterX).toBeLessThan(viewport.width * 0.65);
});
