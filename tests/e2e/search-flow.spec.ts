import { expect, test, type Page } from "@playwright/test";

const query = "5220 Rue Jeanne-Mance";

async function runSearch(page: Page) {
  await page.goto("/?lang=en");
  await page.locator("#address-input").fill(query);
  const searchResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/search") &&
      response.request().method() === "POST" &&
      response.status() < 400,
  );
  await page.getByRole("button", { name: "Search" }).click();
  await searchResponse;
  await expect(
    page.getByRole("heading", { name: "Current or new outages" }),
  ).toBeVisible();
  await expect(page.locator("#search-loading")).toBeHidden();
}

test("page loads in English and French", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator(".ph-brand-mark")).toHaveText("Pannes Historiques");
  await expect(page.locator("#address-input")).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator(".leaflet-control-zoom")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((map) => {
        const payload = JSON.parse(map.getAttribute("data-map") || "{}");
        return payload.matches?.filter((item) => item.kind === "disclosure").length || 0;
      }),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator(".leaflet-pane path").evaluateAll(
        (paths) =>
          paths.filter((path) => {
            const box = path.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          }).length,
      ),
    )
    .toBeGreaterThan(0);

  await page.goto("/?lang=fr");
  await expect(page.locator(".ph-brand-mark")).toHaveText("Pannes Historiques");
  await expect(page.locator("#address-input")).toBeVisible();
});

test("search renders result cards and lazy-loads the map", async ({ page }) => {
  await runSearch(page);
  await expect(page.locator("[data-map-focus]").first()).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator("outage-map")).toHaveAttribute("data-map");
});

test("autocomplete menu appears above existing result cards", async ({ page }) => {
  await runSearch(page);
  await page.locator("#address-input").fill("5220");
  await expect(page.locator("#address-suggestions")).toBeVisible();

  const stacking = await page.evaluate(() => ({
    suggestions: Number.parseInt(
      window.getComputedStyle(document.querySelector("#address-suggestions")!).zIndex,
      10,
    ),
    results: Number.parseInt(
      window.getComputedStyle(document.querySelector("#results")!).zIndex,
      10,
    ),
  }));

  expect(stacking.suggestions).toBeGreaterThan(stacking.results);
});

test("clicking a result before lazy map load replays focus after the map appears", async ({
  page,
}) => {
  await page.route("**/search-map?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  await runSearch(page);
  const firstCard = page.locator("[data-map-focus]").first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  const map = page.locator("outage-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-active-focus-kind", "outage");
  await expect(map).toHaveAttribute("data-active-focus-start-time", "2026-05-09 10:15:00");
});

test("language switch preserves the current query and result state", async ({ page }) => {
  await runSearch(page);

  await page.getByRole("button", { name: "fr" }).click();
  await expect(page).toHaveURL(/lang=fr/);
  await expect(page.locator("#address-input")).toHaveValue(query);
  await expect(
    page.getByRole("heading", { name: "Pannes actuelles ou nouvelles" }),
  ).toBeVisible();
});
