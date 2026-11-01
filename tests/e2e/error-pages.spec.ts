import { expect, test } from "@playwright/test";

for (const lang of ["fr", "en"]) {
  for (const status of [404, 500]) {
    test(`${status} page in ${lang} returns to the working map`, async ({ page }) => {
      const path = status === 404 ? "/missing-page" : "/__test__/server-error";
      const response = await page.goto(`${path}?lang=${lang}`);
      const heading =
        status === 404
          ? lang === "en"
            ? "Page not found"
            : "Page introuvable"
          : lang === "en"
            ? "Something went wrong"
            : "Une erreur est survenue";
      expect(response?.status()).toBe(status);
      await expect(page).toHaveTitle(`${heading} | pannes.ca`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page
        .getByRole("link", { name: lang === "en" ? "Return to the map" : "Revenir à la carte" })
        .click();
      await expect(page.locator("#address-input")).toBeVisible();
      await expect(page.locator("outage-map")).toBeVisible();
      await expect(page.locator(".ph-segmented .ph-segment")).toHaveCount(4);
    });
  }
}
