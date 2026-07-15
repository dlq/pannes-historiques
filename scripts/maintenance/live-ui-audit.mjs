import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = path.resolve(process.env.PANNES_AUDIT_OUTPUT_DIR || "tmp/live-ui-audit");
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch(
  chromePath
    ? {
        headless: true,
        executablePath: chromePath,
      }
    : { headless: true },
);

const addresses = [
  {
    key: "montreal",
    label: "5220 Rue Jeanne-Mance, Montreal, QC",
    query: "5220 Rue Jeanne-Mance, Montreal, QC",
  },
  {
    key: "quebec-city",
    label: "775 Rue Saint-Joseph Est, Quebec, QC",
    query: "775 Rue Saint-Joseph Est, Quebec, QC",
  },
  {
    key: "saguenay",
    label: "930 Rue Jacques-Cartier Est, Saguenay, QC",
    query: "930 Rue Jacques-Cartier Est, Saguenay, QC",
  },
  {
    key: "val-dor",
    label: "855 3e Avenue, Val-d'Or, QC",
    query: "855 3e Avenue, Val-d'Or, QC",
  },
];

const viewports = [
  { key: "desktop", viewport: { width: 1440, height: 1000 }, isMobile: false },
  { key: "ipad", viewport: { width: 1024, height: 1366 }, isMobile: false },
  { key: "iphone", viewport: { width: 390, height: 844 }, isMobile: true },
];

function _rectFor(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  };
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const rectForElement = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      };
    };
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const sheet =
      document.querySelector(".ph-sheet") ||
      document.querySelector("[data-sheet]") ||
      document.querySelector("[data-sheet-body]");
    const map = document.querySelector("outage-map");
    const search =
      document.querySelector("input[type='search']") ||
      document.querySelector("input[name='q']") ||
      document.querySelector("input[placeholder]");
    const visibleTextNodes = [
      ...document.querySelectorAll(
        "h1,h2,h3,button,a,.ph-row-pill,.ph-section-meta,.ph-status-line,.ph-detail-panel,.ph-sheet",
      ),
    ]
      .filter(isVisible)
      .slice(0, 260)
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className || ""),
        aria: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        text: (element.innerText || element.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 180),
        rect: rectForElement(element),
      }));
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 5000),
      sheetRect: sheet ? rectForElement(sheet) : null,
      mapRect: map ? rectForElement(map) : null,
      searchRect: search ? rectForElement(search) : null,
      visibleTextNodes,
    };
  });
}

async function openPage(viewportConfig, url, name) {
  const context = await browser.newContext({
    viewport: viewportConfig.viewport,
    deviceScaleFactor: 1,
    isMobile: viewportConfig.isMobile,
    hasTouch: viewportConfig.isMobile || viewportConfig.key === "ipad",
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const failedRequests = [];
  const responseSummaries = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`,
    );
  });
  page.on("response", (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes("/sheet") || responseUrl.includes("/api/durable/runtime/")) {
      responseSummaries.push({ url: responseUrl, status: response.status() });
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  const snapshot = await pageSnapshot(page);
  snapshot.consoleMessages = consoleMessages.slice(0, 20);
  snapshot.failedRequests = failedRequests.slice(0, 20);
  snapshot.responseSummaries = responseSummaries.slice(0, 30);
  await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(snapshot, null, 2));
  await context.close();
  return snapshot;
}

const results = { viewports: {}, addresses: {} };

for (const viewport of viewports) {
  results.viewports[viewport.key] = await openPage(
    viewport,
    "https://pannes.ca/?lang=en",
    `pannes-live-${viewport.key}`,
  );
}

for (const address of addresses) {
  const url = `https://pannes.ca/?q=${encodeURIComponent(address.query)}&lang=en`;
  results.addresses[address.key] = {
    label: address.label,
    desktop: await openPage(viewports[0], url, `pannes-address-${address.key}-desktop`),
    iphone: await openPage(viewports[2], url, `pannes-address-${address.key}-iphone`),
  };
}

await fs.writeFile(
  path.join(outDir, "pannes-live-audit-summary.json"),
  JSON.stringify(results, null, 2),
);
await browser.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      files: [
        "pannes-live-desktop.png",
        "pannes-live-ipad.png",
        "pannes-live-iphone.png",
        ...addresses.flatMap((address) => [
          `pannes-address-${address.key}-desktop.png`,
          `pannes-address-${address.key}-iphone.png`,
        ]),
        "pannes-live-audit-summary.json",
      ],
    },
    null,
    2,
  ),
);
