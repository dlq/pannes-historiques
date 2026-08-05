import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  isUsableArchiveSummary,
  municipalArchiveLatestRow,
} from "../src/archive-summary.js";

test("municipal archive latest rows retain their territory identity", () => {
  assert.deepEqual(
    municipalArchiveLatestRow({
      territory_id: "municipality:58227",
      territory_name: "Longueuil",
      max_customers: 17,
      sort_time: "2026-07-10 11:46:39",
    }),
    {
      key: "previous_archive_latest",
      territoryId: "municipality:58227",
      territoryName: "Longueuil",
      customersAffected: 17,
      startTime: "2026-07-10 11:46:39",
    },
  );
});

// The Archive window cell reported COUNT(DISTINCT territory_id) -- a count of
// municipalities -- under a heading that says outages. It went unnoticed
// because the field was called `areas` and the OTHER summary path filled that
// same key with a genuine outage count, so the label was correct for one
// caller. These guards pin both halves of that fix.
test("archive window counts outages, not municipalities", () => {
  const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const query = source.slice(
    source.indexOf("async function municipalArchiveWindow"),
    source.indexOf("async function municipalArchiveLargest"),
  );
  assert.ok(query.length > 0, "municipalArchiveWindow not found");

  assert.match(
    query,
    /SUM\(COALESCE\(event_count, 1\)\) AS outages/,
    "the window number must aggregate outages",
  );
  assert.doesNotMatch(
    query,
    /COUNT\(DISTINCT territory_id\) AS outages/,
    "counting territories saturates near Quebec's ~1100 municipalities",
  );
  // Overlap rows repeat a polygon once per municipality it touches, so
  // dropping this filter would inflate the count for every wide outage.
  assert.match(query, /assignment_type = 'primary'/);
});

test("both archive summary paths publish the same window field", () => {
  const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.equal(
    source.match(/^\s*(?:outages|areas):/gm).filter((line) => line.includes("areas")).length,
    0,
    "`areas` meant outages in one path and territories in the other; keep one name",
  );
});

test("a stored summary from an older payload shape is treated as a cache miss", () => {
  // The shape actually in production before the rename: a territory count under
  // the key `areas`. Served verbatim, the renamed template would have read
  // `outages` as missing and drawn 0 in all four windows.
  const stored = {
    windows: [
      { key: "previous_archive_last_24h", areas: 130, totalCustomers: 145285 },
      { key: "previous_archive_last_1y", areas: 1139, totalCustomers: 22290686 },
    ],
    territories: [],
  };
  assert.equal(isUsableArchiveSummary(stored), false);

  const rebuilt = {
    windows: [
      { key: "previous_archive_last_24h", outages: 1714, totalCustomers: 145285 },
      { key: "previous_archive_last_1y", outages: 234187, totalCustomers: 22290686 },
    ],
    territories: [],
  };
  assert.equal(isUsableArchiveSummary(rebuilt), true);

  // Zero is a real answer for a quiet window and must not look like a miss.
  assert.equal(isUsableArchiveSummary({ windows: [{ outages: 0 }] }), true);
  assert.equal(isUsableArchiveSummary(null), false);
  assert.equal(isUsableArchiveSummary({}), false);
});
