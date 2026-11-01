import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// A small, repeatable document-resource baseline, not a load test or real-user metric.
const target = new URL(process.env.PANNES_BASELINE_URL || "https://pannes.ca/?lang=en");
const outDir = path.resolve(process.env.PANNES_BASELINE_OUTPUT_DIR || "tmp/module-baseline");
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
  throw new Error("Expected an HTTP(S) application URL without credentials");
}
if (
  target.pathname !== "/" ||
  [...target.searchParams].some(([key, value]) => key !== "lang" || !["fr", "en"].includes(value))
) {
  throw new Error(
    "Use the root page with only an optional lang=fr/en parameter; do not capture searched addresses",
  );
}
const browser = await chromium.launch();
const runs = [];
try {
  await mkdir(outDir, { recursive: true });
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    for (let sample = 1; sample <= 3; sample++) {
      // A new context has its own empty HTTP cache and no installed service worker.
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true });
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        for (const cache of ["cold", "warm"]) {
          if (cache === "cold") await page.goto(target.href, { waitUntil: "load" });
          else await page.reload({ waitUntil: "load" });
          await page.waitForFunction(
            () => {
              const map = document.querySelector("outage-map")?.map;
              return (
                document.body.dataset.appReady === "true" && map?.loaded() && map.isStyleLoaded()
              );
            },
            null,
            { timeout: 90000 },
          );
          const metrics = await page.evaluate(() => {
            const navigation = performance.getEntriesByType("navigation")[0];
            return {
              ttfbMs: navigation.responseStart - navigation.requestStart,
              domContentLoadedMs: navigation.domContentLoadedEventEnd,
              loadMs: navigation.loadEventEnd,
              mapReadyObservedMs: performance.now(),
              paint: performance
                .getEntriesByType("paint")
                .map(({ name, startTime }) => ({ name, startTime })),
              resources: performance
                .getEntriesByType("resource")
                .filter(
                  ({ name }) =>
                    new URL(name).origin === location.origin &&
                    /\.(?:m?js|css)$/.test(new URL(name).pathname),
                )
                .map(
                  ({
                    name,
                    startTime,
                    responseEnd,
                    transferSize,
                    encodedBodySize,
                    decodedBodySize,
                    initiatorType,
                  }) => ({
                    path: new URL(name).pathname + new URL(name).search,
                    startMs: startTime,
                    endMs: responseEnd,
                    transferBytes: transferSize,
                    encodedBytes: encodedBodySize,
                    decodedBytes: decodedBodySize,
                    initiator: initiatorType,
                  }),
                ),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          if (metrics.overflow || errors.length)
            throw new Error(JSON.stringify({ device, cache, errors, overflow: metrics.overflow }));
          runs.push({ device, sample, cache, ...metrics });
          if (sample === 1 && cache === "cold")
            await page.screenshot({ path: path.join(outDir, `${device}.png`) });
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  path.join(outDir, "baseline.json"),
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      target: target.href,
      runs,
      scope:
        "Main-document same-origin JS/CSS Resource Timing entries; worker-context fetches and cross-origin map/beacon/font traffic excluded. Three fresh contexts per viewport, each followed by a warm reload. No CPU/network throttle; viewport sizes do not emulate phone performance. GPC suppresses application usage reporting. transferBytes includes browser-reported response overhead; zero transferBytes can reflect cache/service-worker reuse. Map-ready observation is an upper bound, not paint latency.",
    },
    null,
    2,
  ),
);
console.log(`Saved ${runs.length} measurements to ${outDir}`);
