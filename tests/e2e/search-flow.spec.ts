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
    page.getByRole("heading", { name: "Current" }),
  ).toBeVisible();
  await expect(page.locator("#search-loading")).toBeHidden();
}

test("page loads in English and French", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator(".ph-brand-mark")).toHaveText("Outage History");
  await expect(page).toHaveTitle("Outage History");
  await expect(page.locator("#address-input")).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator(".leaflet-control-zoom")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((map) => {
        const payload = JSON.parse(map.getAttribute("data-map") || "{}");
        return payload.matches?.filter((item) => item.kind === "outage").length || 0;
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

test("app exposes installable web app metadata", async ({ page, request }) => {
  await page.goto("/?lang=en");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/static/manifest.webmanifest",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#223654");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );

  const manifestResponse = await request.get("/static/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.scope).toBe("/");
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose).sort()).toEqual([
    "any",
    "any",
    "any",
    "maskable",
  ]);
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );

  await expect
    .poll(() =>
      page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return [];
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.some((registration) => registration.scope === `${location.origin}/`);
      }),
    )
    .toBe(true);
});

test("search renders result cards and lazy-loads the map", async ({ page }) => {
  await runSearch(page);
  await expect(
    page.getByRole("heading", { name: "Current" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);
  await expect(page.getByRole("heading", { name: "Planned" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Seen Before Here" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Disclosures" })).toBeVisible();
  await expect(page.locator("[data-map-focus]").first()).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator("outage-map")).toHaveAttribute("data-map");
});

test("map explains and visually prioritizes production-shaped layers", async ({ page }) => {
  await runSearch(page);

  const secondaryToggles = [
    page.locator('[data-layer-toggle="planned"]').first(),
    page.locator('[data-layer-toggle="previous"]').first(),
    page.locator('[data-layer-toggle="published"]').first(),
  ];

  await expect(page.locator("dai-detail-panel")).toBeHidden();
  await expect(page.locator(".ph-map-legend")).toHaveCount(0);
  await expect(page.locator("#ph-context-current")).toHaveAttribute(
    "aria-label",
    "Current Hydro-Quebec feed outages",
  );
  await expect(page.locator("#ph-context-current .ph-layer-count")).toHaveAttribute(
    "aria-label",
    /\d+ areas/,
  );
  await page.locator("#ph-context-current summary").focus();
  await expect
    .poll(() =>
      page.locator("#ph-context-current summary").evaluate((summary) => {
        const style = window.getComputedStyle(summary);
        return style.outlineStyle;
      }),
    )
    .not.toBe("none");
  await expect(page.locator('[data-layer-toggle="planned"]').first()).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((map) => {
        const payload = JSON.parse(map.getAttribute("data-map") || "{}");
        return [
          ...new Set((payload.matches || []).map((item: { kind: string }) => item.kind)),
        ].sort();
      }),
    )
    .toEqual(["outage"]);

  for (const toggle of secondaryToggles) {
    await toggle.click();
  }

  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((map) => {
        const payload = JSON.parse(map.getAttribute("data-map") || "{}");
        return [
          ...new Set((payload.matches || []).map((item: { kind: string }) => item.kind)),
        ].sort();
      }),
    )
    .toEqual(["outage"]);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const visibleLayerKinds = ["outage", "planned", "previous_outage", "regional_metric"];
        return visibleLayerKinds.filter((kind) => {
          const layer = document.querySelector(`.ph-map-layer-${kind}`);
          if (!layer) return false;
          const box = layer.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        });
      }),
    )
    .toEqual(["outage", "planned", "previous_outage", "regional_metric"]);

  await expect(page.locator(".ph-map-layer-disclosure")).toHaveCount(1);

  const styles = await page.evaluate(() => {
    const readStyle = (kind: string) => {
      const layer = document.querySelector(`.ph-map-layer-${kind}`);
      if (!layer) return null;
      const computed = window.getComputedStyle(layer);
      return {
        dash: layer.getAttribute("stroke-dasharray") || computed.strokeDasharray,
        fillOpacity: Number.parseFloat(
          layer.getAttribute("fill-opacity") || computed.fillOpacity || "0",
        ),
        strokeOpacity: Number.parseFloat(
          layer.getAttribute("stroke-opacity") || computed.strokeOpacity || "0",
        ),
        weight: Number.parseFloat(
          layer.getAttribute("stroke-width") || computed.strokeWidth || "0",
        ),
      };
    };

    return {
      outage: readStyle("outage"),
      planned: readStyle("planned"),
      previous: readStyle("previous_outage"),
      disclosure: readStyle("disclosure"),
      regional: readStyle("regional_metric"),
    };
  });

  expect(styles.outage?.fillOpacity).toBeGreaterThan(styles.planned?.fillOpacity || 0);
  expect(styles.planned?.fillOpacity).toBeGreaterThan(styles.previous?.fillOpacity || 0);
  expect(styles.previous?.fillOpacity).toBeGreaterThan(styles.disclosure?.fillOpacity || 0);
  expect(styles.disclosure?.fillOpacity).toBeGreaterThan(styles.regional?.fillOpacity || 0);
  expect(styles.outage?.weight).toBeGreaterThan(styles.disclosure?.weight || 0);
  expect(styles.previous?.dash).not.toBe("none");
  expect(styles.disclosure?.dash).not.toBe("none");
  expect(styles.regional?.strokeOpacity).toBeLessThan(styles.previous?.strokeOpacity || 1);
});

test("browser history reloads canonical search URL state", async ({ page }) => {
  await runSearch(page);
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);

  await page.goBack();
  await expect(page).toHaveURL(/\/\?lang=en$/);
  await expect(page.locator("#address-input")).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Current" }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);
  await expect(page.locator("#address-input")).toHaveValue(query);
  await expect(page.getByRole("heading", { name: "Planned" })).toBeVisible();
});

test("selected result rows stay visibly linked to the map", async ({ page }) => {
  await runSearch(page);
  const firstCard = page.locator("[data-map-focus]").first();
  await firstCard.click();
  await expect(firstCard).toHaveClass(/is-map-selected/);
  await expect(firstCard).toHaveAttribute("aria-pressed", "true");
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
  await expect(page).not.toHaveURL(/radius_m|days|include_planned/);
  await expect(page.locator("#address-input")).toHaveValue(query);
  await expect(
    page.getByRole("heading", { name: "Actuelles" }),
  ).toBeVisible();
});
