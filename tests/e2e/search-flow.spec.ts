import { expect, test, type Page } from "@playwright/test";

const query = "5220 Rue Jeanne-Mance";

async function runSearch(page: Page) {
  await page.goto("/?lang=en");
  await page.locator("#address-input").fill(query);
  const sheetResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/sheet") &&
      response.url().includes("domain=overview") &&
      response.status() < 400,
  );
  await page.locator("#address-input").press("Enter");
  await sheetResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
}

test("page loads in English and French with the sheet shell", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator(".ph-brand-chip")).toHaveText("pannes.ca");
  await expect(page).toHaveTitle("Outage History");
  await expect(page.locator("#address-input")).toBeVisible();
  await expect(page.locator("outage-map")).toBeVisible();
  await expect(page.locator(".ph-segmented .ph-segment")).toHaveCount(4);
  await expect(page.locator(".ph-segment.is-active")).toHaveText("Live");
  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((map) => {
        const payload = JSON.parse(map.getAttribute("data-map") || "{}");
        return payload.matches?.filter((item) => item.kind === "outage").length || 0;
      }),
    )
    .toBeGreaterThan(0);

  await page.goto("/?lang=fr");
  await expect(page.locator(".ph-segment.is-active")).toHaveText("En cours");
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

test("address search opens the overview answer stack", async ({ page }) => {
  await runSearch(page);
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);
  await expect(page.locator("#sheet-body .ph-sheet-title")).toContainText("5220");
  await expect(page.locator("#sheet-body .ph-sheet-subtitle").first()).toContainText("5 km");
  await expect(page.locator(".ph-status-line")).toHaveCount(3);
  await expect(page.locator(".ph-hero-card")).toBeVisible();
  await expect(page.locator(".ph-hero-number")).toHaveText(/\d+/);
  await expect(page.locator(".ph-hero-caveat")).toContainText("not Hydro-Quebec's official");
  await expect(page.locator('[data-domain-link="archive"].ph-action-button')).toBeVisible();
  await expect(page.locator("outage-map")).toHaveAttribute("data-map", /.+/);
});

test("segmented control switches explore domains and map layers", async ({ page }) => {
  await page.goto("/?lang=en");

  const plannedResponse = page.waitForResponse((response) =>
    response.url().includes("domain=planned"),
  );
  await page.locator('.ph-segment[data-domain-link="planned"]').click();
  await plannedResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="planned"]')).toBeVisible();
  await expect(page.locator(".ph-date-tile").first()).toBeVisible();
  await expect(page.locator('[data-domain-rows="planned"] .ph-row').first()).toBeVisible();

  const archiveResponse = page.waitForResponse((response) =>
    response.url().includes("domain=archive"),
  );
  await page.locator('.ph-segment[data-domain-link="archive"]').click();
  await archiveResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="archive"]')).toBeVisible();
  await expect(page.locator(".ph-domain-title")).toContainText("Observed outage report");

  const contextResponse = page.waitForResponse((response) =>
    response.url().includes("domain=context"),
  );
  await page.locator('.ph-segment[data-domain-link="context"]').click();
  await contextResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="context"]')).toBeVisible();
  await expect(page.locator(".ph-context-intro")).toBeVisible();
  await expect(page.locator('[data-domain-rows="context"] .ph-row').first()).toBeVisible();
});





test("context document rows open the restyled disclosure card", async ({ page }) => {
  await page.goto("/?lang=en");

  const contextResponse = page.waitForResponse((response) =>
    response.url().includes("domain=context"),
  );
  await page.locator('.ph-segment[data-domain-link="context"]').click();
  await contextResponse;

  const documentRow = page
    .locator('[data-domain-rows="context"] .ph-row')
    .filter({ hasText: "Outremont" })
    .first();
  await documentRow.click();

  const panel = page.locator("dai-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".ph-sheet-title")).toHaveText("Outremont");
  await expect(panel.locator(".ph-detail-facts li").first()).toBeVisible();
  await expect(panel.locator(".ph-group-heading").first()).toContainText("Top causes");
  await panel.locator("[data-dai-detail-close]").click();
  await expect(panel).toBeHidden();
});

test("comparison tray stores and clears compared addresses", async ({ page }) => {
  await runSearch(page);

  await page.locator("[data-compare-add]").click();
  const tray = page.locator("[data-compare-tray]");
  await expect(tray).toBeVisible();
  await expect(tray.locator(".ph-compare-row")).toHaveCount(1);
  await expect(tray.locator(".ph-compare-address")).toContainText("5220");

  await page.reload();
  await expect(page.locator("[data-compare-tray]")).toBeVisible();
  await expect(page.locator(".ph-compare-row")).toHaveCount(1);

  await page.locator(".ph-compare-clear").click();
  await expect(page.locator("[data-compare-tray]")).toBeHidden();
});

test("provenance card opens from the explore footer and the hero info button", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await expect(page.locator("#sheet-provenance")).toBeHidden();

  await page.locator('.ph-sheet-footer-link[data-layer-info]').click();
  await expect(page.locator("#sheet-provenance")).toBeVisible();
  await expect(page.locator("#sheet-provenance .ph-sheet-title")).toHaveText("About this data");
  await expect(page.locator("#sheet-provenance .ph-provenance-item")).toHaveCount(3);
  await expect(
    page.locator('#sheet-provenance a[href="mailto:contact@pannes.ca"]'),
  ).toBeVisible();
  await expect(page.locator('#sheet-provenance a[href*="github"]')).toBeVisible();
  await page.locator("#sheet-provenance [data-detail-close]").click();
  await expect(page.locator("#sheet-provenance")).toBeHidden();
});

test("failed sheet fetches show an error and recover", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator(".ph-segment.is-active")).toHaveText("Live");

  await page.route("**/sheet**", (route) => route.abort());
  await page.locator('.ph-segment[data-domain-link="planned"]').click();
  await expect(page.locator(".ph-sheet-error")).toBeVisible();
  await expect(page.locator(".ph-sheet-error")).toContainText("could not load");
  await expect(page.locator(".ph-segment.is-active")).toHaveText("Live");

  await page.unroute("**/sheet**");
  const plannedResponse = page.waitForResponse((response) =>
    response.url().includes("domain=planned"),
  );
  await page.locator('.ph-segment[data-domain-link="planned"]').click();
  await plannedResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="planned"]')).toBeVisible();
});

test("current rows sort by customers or recency", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.locator('[data-sortable-rows] .ph-row').first()).toBeVisible();

  const readMetrics = () =>
    page
      .locator('[data-sortable-rows] .ph-row-metric-value')
      .allTextContents()
      .then((values) => values.map((value) => Number(value.replace(/\s/g, ""))));
  const metricsByClients = await readMetrics();
  const sortedDescending = [...metricsByClients].sort((a, b) => b - a);
  expect(metricsByClients).toEqual(sortedDescending);

  await page.locator('[data-sort-option="recent"]').click();
  await expect(page.locator('[data-sort-option="recent"]')).toHaveClass(/is-active/);
  const startTimes = await page
    .locator('[data-sortable-rows] [data-map-focus]')
    .evaluateAll((rows) =>
      rows.map((row) => JSON.parse(row.getAttribute("data-map-focus") || "{}").startTime || ""),
    );
  const newestFirst = [...startTimes].sort().reverse();
  expect(startTimes).toEqual(newestFirst);

  await page.locator('[data-sort-option="clients"]').click();
  expect(await readMetrics()).toEqual(sortedDescending);
});


test("archive territory rows outline the area on the map", async ({ page }) => {
  await page.goto("/?lang=en");

  const archiveResponse = page.waitForResponse((response) =>
    response.url().includes("domain=archive"),
  );
  await page.locator('.ph-segment[data-domain-link="archive"]').click();
  await archiveResponse;

  const montrealRow = page
    .locator('[data-domain-rows="archive"] .ph-row')
    .filter({ hasText: "Montréal" })
    .first();
  await expect(montrealRow).toBeVisible();
  await expect(montrealRow.locator(".ph-row-metric-value")).toHaveText("42");
  await expect(montrealRow).toContainText("up to 1 200 customers");
  await montrealRow.click();

  await expect(page.locator("outage-map")).toHaveAttribute(
    "data-active-focus-label",
    "Montréal",
  );
  await expect
    .poll(() =>
      page.locator("outage-map").evaluate((mapElement) => {
        const source = mapElement.map?.getSource("ph-focus");
        return source?.serialize?.().data?.features?.length ?? 0;
      }),
    )
    .toBeGreaterThan(0);
});

test("overview doorway opens the local archive with scope toggle", async ({ page }) => {
  await runSearch(page);

  const archiveResponse = page.waitForResponse((response) =>
    response.url().includes("domain=archive"),
  );
  await page.locator('[data-domain-link="archive"].ph-action-button').click();
  await archiveResponse;
  await expect(page.locator('.ph-sheet-content[data-domain="archive"]')).toBeVisible();
  await expect(page.locator(".ph-scope-button.is-active")).toHaveText("5 km");
  await expect(page.locator('[data-domain-rows="archive"] .ph-row').first()).toBeVisible();
  await expect(page.locator('[data-domain-link="overview"]').first()).toBeVisible();

  const provinceResponse = page.waitForResponse((response) =>
    response.url().includes("scope=province"),
  );
  await page.locator('[data-scope-link="province"]').click();
  await provinceResponse;
  await expect(page.locator(".ph-domain-title")).toContainText("Observed outage report");

  const overviewResponse = page.waitForResponse((response) =>
    response.url().includes("domain=overview"),
  );
  await page.locator('[data-domain-link="overview"]').first().click();
  await overviewResponse;
  await expect(page.locator(".ph-hero-card")).toBeVisible();
});

test("archive rows select on the map and open a detail card", async ({ page }) => {
  await runSearch(page);

  const archiveResponse = page.waitForResponse((response) =>
    response.url().includes("domain=archive"),
  );
  await page.locator('[data-domain-link="archive"].ph-action-button').click();
  await archiveResponse;

  const firstRow = page.locator('[data-domain-rows="archive"] .ph-row').first();
  await firstRow.click();
  await expect(firstRow).toHaveClass(/is-map-selected/);
  await expect(page.locator("outage-map")).toHaveAttribute(
    "data-active-focus-kind",
    "previous_outage",
  );
  await expect(page.locator("#sheet-detail")).toBeVisible();
  await expect(page.locator("#sheet-detail .ph-detail-facts li").first()).toBeVisible();
  await expect(page.locator("#sheet-detail .ph-detail-source-note")).toContainText("pannes.ca");

  await page.locator("#sheet-detail [data-detail-close]").first().click();
  await expect(page.locator("#sheet-detail")).toBeHidden();
});

test("browser history reloads canonical search URL state", async ({ page }) => {
  await runSearch(page);
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);

  await page.goBack();
  await expect(page).toHaveURL(/\/\?lang=en$/);
  await expect(page.locator('.ph-sheet-content[data-mode="explore"]')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/q=5220\+Rue\+Jeanne-Mance|q=5220%20Rue%20Jeanne-Mance/);
  await expect(page.locator('.ph-sheet-content[data-domain="overview"]')).toBeVisible();
});

test("clearing the search returns to explore mode with a clean URL", async ({ page }) => {
  await runSearch(page);

  const clearResponse = page.waitForResponse((response) =>
    response.url().includes("domain=current"),
  );
  await page.locator('[data-action="clear-search"]').click();
  await clearResponse;
  await expect(page.locator('.ph-sheet-content[data-mode="explore"]')).toBeVisible();
  await expect(page).toHaveURL(/\/\?lang=en$/);
  await expect(page.locator("#address-input")).toHaveValue("");
});

test("autocomplete suggestions appear under the sheet search field", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.locator("#address-input").fill("5220");
  await expect(page.locator("#address-suggestions")).toBeVisible();
  await expect(page.locator("#address-suggestions button").first()).toBeVisible();
});

test("language switch preserves the current query", async ({ page }) => {
  await runSearch(page);

  const clearResponse = page.waitForResponse((response) =>
    response.url().includes("domain=current"),
  );
  await page.locator('[data-action="clear-search"]').click();
  await clearResponse;

  await page.locator("[data-lang-switch]").click();
  await expect(page).toHaveURL(/lang=fr/);
  await expect(page.locator(".ph-segment.is-active")).toHaveText("En cours");
});
