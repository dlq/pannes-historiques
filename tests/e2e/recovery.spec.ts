import { expect, test } from "@playwright/test";

for (const lang of ["fr", "en"]) {
  for (const code of [1, 2, 3, 0]) {
    test(`location failure ${code} in ${lang} explains recovery`, async ({ page }) => {
      await page.addInitScript((errorCode) => {
        Object.defineProperty(navigator, "geolocation", {
          configurable: true,
          value:
            errorCode === 0
              ? undefined
              : {
                  getCurrentPosition(_success, failure) {
                    queueMicrotask(() => failure({ code: errorCode }));
                  },
                },
        });
      }, code);
      await page.goto(`/?lang=${lang}`);
      await expect(page.locator("body")).toHaveAttribute("data-app-ready", "true");
      const button = page.locator("#location-search-button");
      const messages =
        lang === "en"
          ? {
              1: "Location access was not allowed. Search by address instead.",
              2: "Current location could not be found.",
              3: "Current location took too long. Search by address instead.",
              0: "Current location could not be found.",
            }
          : {
              1: "L'accès à la position n'a pas été autorisé. Recherchez plutôt par adresse.",
              2: "Impossible d'obtenir la position actuelle.",
              3: "La localisation prend trop de temps. Recherchez plutôt par adresse.",
              0: "Impossible d'obtenir la position actuelle.",
            };
      await button.click();
      await expect(page.getByRole("alert")).toHaveText(messages[code]);
      await expect(button).toBeEnabled();
      await expect(button.locator("svg")).toHaveCount(1);
      await page.locator("#address-input").fill("5220 Rue Jeanne-Mance");
      await page.locator("#address-input").press("Enter");
      await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  }

  test(`offline recovery preserves the ${lang} address URL`, async ({ page, context }) => {
    const path = lang === "en" ? "/?lang=en&q=5220+Rue+Jeanne-Mance" : "/?q=5220+Rue+Jeanne-Mance";
    await page.goto(path);
    await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          });
        });
    });
    const url = page.url();
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle(lang === "en" ? "pannes.ca offline" : "pannes.ca hors ligne");
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      lang === "en" ? "Offline for now" : "Hors ligne pour le moment",
    );
    const retry = page.getByRole("button", { name: lang === "en" ? "Try again" : "Réessayer" });
    await expect(retry).toBeVisible();
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await retry.click();
    await expect(retry).toBeVisible();
    expect(page.url()).toBe(url);
    await context.setOffline(false);
    await retry.click();
    await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
    expect(page.url()).toBe(url);
  });
}
