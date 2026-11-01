import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const out = path.resolve(process.env.PANNES_A11Y_OUTPUT_DIR || "tmp/accessibility-audit");
const base = new URL(
  process.env.PANNES_A11Y_BASE_URL || `http://127.0.0.1:${process.env.APP_PORT || 4173}`,
);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== "/"
)
  throw Error("Use the isolated local fixture root URL");
if (!process.env.AXE_CORE_PATH)
  throw Error(
    "Set AXE_CORE_PATH to an installed axe-core/axe.min.js; see docs/accessibility-audit.md",
  );
await mkdir(out, { recursive: true });
const axeSource = await readFile(process.env.AXE_CORE_PATH, "utf8");
const browser = await chromium.launch(),
  runs = [];
async function scan(page, name, lang, device) {
  await page.evaluate(axeSource);
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
    }),
  );
  runs.push({
    name,
    lang,
    device,
    version: r.testEngine.version,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        failureSummary: n.failureSummary,
      })),
    })),
    incomplete: r.incomplete.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
    passes: r.passes.length,
  });
  if (r.violations.length || (lang === "en" && ["planned", "about", "overview"].includes(name)))
    await page.screenshot({ path: `${out}/${device}-${lang}-${name}.png`, fullPage: false });
  console.log(
    JSON.stringify({
      name,
      lang,
      device,
      violations: r.violations.map((v) => ({ id: v.id, count: v.nodes.length })),
    }),
  );
  await writeFile(`${out}/report.json`, JSON.stringify(runs, null, 2));
}
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ])
    for (const lang of ["fr", "en"]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(`${base.origin}/?lang=${lang}`);
      await page.locator("body[data-app-ready=true]").waitFor();
      if (!(await page.title()).includes("pannes.ca") && lang === "en")
        throw Error("Unexpected app identity");
      for (const domain of ["current", "planned", "archive", "context"]) {
        if (domain !== "current") {
          await page.locator(`.ph-segment[data-domain-link=${domain}]`).click();
          await page.locator(`.ph-sheet-content[data-domain=${domain}]`).waitFor();
        }
        await scan(page, domain, lang, device);
      }
      for (const label of ["Outremont", "Montreal"]) {
        const row = page
          .locator("[data-domain-rows=context] .ph-row")
          .filter({ hasText: label })
          .first();
        await row.click();
        await page.locator("dai-detail-panel").waitFor();
        await scan(page, `detail-${label}`, lang, device);
        await page.keyboard.press("Escape");
      }
      await page.locator("[data-layer-info]").first().click();
      await page.locator("#sheet-provenance").waitFor();
      await scan(page, "provenance", lang, device);
      await page.keyboard.press("Escape");
      await page.locator("#address-input").fill("5220 Rue Jeanne-Mance");
      await page.locator("#address-input").press("Enter");
      await page.locator(".ph-sheet-content[data-domain=overview]").waitFor();
      await scan(page, "overview", lang, device);
      for (const [name, path] of [
        ["about", "/about"],
        ["404", "/missing-a11y"],
        ["offline", "/static/offline.html"],
      ]) {
        await page.goto(`${base.origin}${path}?lang=${lang}`);
        await scan(page, name, lang, device);
      }
      await context.close();
    }
} finally {
  await browser.close();
}
console.log(
  "TOTAL " +
    runs.length +
    " states; violations " +
    runs.reduce((n, r) => n + r.violations.length, 0),
);

if (runs.some((r) => r.violations.length)) process.exitCode = 1;
