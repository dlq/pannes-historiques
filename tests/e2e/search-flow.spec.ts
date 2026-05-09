import { expect, test, type Page } from "@playwright/test";

const query = "5220 Rue Jeanne-Mance";

async function runSearch(page: Page) {
  await page.goto("/?lang=en");
  await page.locator("#address-input").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(
    page.getByRole("heading", { name: "Current or new outages" }),
  ).toBeVisible();
}

test("page loads in English and French", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(
    page.getByRole("heading", { name: "Start from a specific Quebec address" }),
  ).toBeVisible();

  await page.goto("/?lang=fr");
  await expect(
    page.getByRole("heading", { name: "Commencez par une adresse precise au Quebec" }),
  ).toBeVisible();
});

test("search renders result cards and lazy-loads the map", async ({ page }) => {
  await runSearch(page);
  await expect(page.locator("[data-map-focus]").first()).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator("outage-map")).toHaveAttribute("data-map");
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
