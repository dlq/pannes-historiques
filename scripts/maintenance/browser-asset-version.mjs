import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

const STATIC_ROOT = new URL("../../app/static/", import.meta.url);
const INTERNAL_IMPORT = /(from\s+"\.\/((?!vendor\/)[^"]+\.js)\?v=)([0-9a-z]+)(")/g;
const ICON_SPRITE = /(\/static\/icons\.svg\?v=)([0-9a-z]+)(#?)/g;
const NORMALIZED_TOKEN = "asset-version";

function normalizedSource(source) {
  return source
    .replace(INTERNAL_IMPORT, `$1${NORMALIZED_TOKEN}$4`)
    .replace(ICON_SPRITE, `$1${NORMALIZED_TOKEN}$3`);
}

async function browserAssetFiles() {
  const names = (await readdir(STATIC_ROOT)).filter((name) => name.endsWith(".js")).sort();
  return [...names, "icons.svg"];
}

async function calculateGeneration(files) {
  const digest = createHash("sha256");
  for (const name of files) {
    digest.update(name);
    digest.update("\0");
    digest.update(normalizedSource(await readFile(new URL(name, STATIC_ROOT), "utf8")));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 12);
}

function tokensIn(source) {
  return [
    ...Array.from(source.matchAll(INTERNAL_IMPORT), (match) => match[3]),
    ...Array.from(source.matchAll(ICON_SPRITE), (match) => match[2]),
  ];
}

const files = await browserAssetFiles();
const generation = await calculateGeneration(files);
const checkOnly = process.argv.includes("--check");
let stale = false;
let tokenCount = 0;

for (const name of files) {
  const url = new URL(name, STATIC_ROOT);
  const source = await readFile(url, "utf8");
  const tokens = tokensIn(source);
  tokenCount += tokens.length;
  if (tokens.some((token) => token !== generation)) stale = true;
  if (!checkOnly) {
    const updated = source
      .replace(INTERNAL_IMPORT, `$1${generation}$4`)
      .replace(ICON_SPRITE, `$1${generation}$3`);
    if (updated !== source) await writeFile(url, updated);
  }
}

if (checkOnly && (stale || tokenCount === 0)) {
  console.error(`Browser asset generation is stale; run npm run assets:version (${generation}).`);
  process.exitCode = 1;
} else {
  console.log(generation);
}
