import { expect, test } from "@playwright/test";

test.use({
  geolocation: { latitude: 45.5186, longitude: -73.6027 },
  permissions: ["geolocation"],
});

test("current location search renders deterministic results", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.getByRole("button", { name: "Use current location" }).click();

  await expect(
    page.getByRole("heading", { name: "Current or new outages" }),
  ).toBeVisible();
  await expect(page.locator("#address-input")).toHaveValue(/Current location/);
  await expect(page.locator("outage-map")).toBeVisible();
});
