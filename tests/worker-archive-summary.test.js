import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  archiveSummaryIncoherences,
  isUsableArchiveSummary,
  municipalArchiveLatestRow,
} from "../src/archive-summary.js";

const WINDOW_KEYS = [
  "previous_archive_last_24h",
  "previous_archive_last_7d",
  "previous_archive_last_30d",
  "previous_archive_last_1y",
];

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

  // Collapse whitespace first so reformatting the SQL cannot fail this on
  // spelling. What is pinned is which column feeds the window number, not how
  // the query is laid out.
  const sql = query.replace(/\s+/g, " ");

  assert.match(sql, /SUM\(\s*COALESCE\(\s*event_count[^)]*\)\s*\) AS outages/, [
    "the window number must aggregate outages.",
    "It ran COUNT(DISTINCT territory_id), so it counted municipalities and",
    "saturated near Quebec's ~1100 of them while claiming to count outages.",
  ].join(" "));
  assert.doesNotMatch(sql, /COUNT\([^)]*territory_id[^)]*\) AS outages/);
  // Overlap rows repeat a polygon once per municipality it touches, so
  // dropping this filter would inflate the count for every wide outage.
  assert.match(sql, /assignment_type = 'primary'/);
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
  assert.equal(isUsableArchiveSummary({ windows: [{ outages: 0, totalCustomers: 0 }] }), true);
  assert.equal(isUsableArchiveSummary(null), false);
  assert.equal(isUsableArchiveSummary({}), false);
});

test("coherence checks catch the payload production actually served", () => {
  // Verbatim from pannes.ca before the fix: windows counting municipalities,
  // territory rows counting outages. Every individual number was exactly what
  // its query returned; only their relationship to each other was impossible.
  const served = {
    windows: [
      { key: "previous_archive_last_24h", outages: 130, totalCustomers: 145285 },
      { key: "previous_archive_last_7d", outages: 594, totalCustomers: 1243771 },
      { key: "previous_archive_last_30d", outages: 979, totalCustomers: 4595713 },
      { key: "previous_archive_last_1y", outages: 1139, totalCustomers: 22290686 },
    ],
    territories: [{ territoryName: "Montréal", eventCount: 16785 }],
    largest: { customersAffected: 25018 },
  };

  const problems = archiveSummaryIncoherences(served);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Montréal reports 16785 outages, more than the 1139/);
});

test("the corrected figures are coherent", () => {
  // Measured from production D1 on 2026-08-05.
  assert.deepEqual(
    archiveSummaryIncoherences({
      windows: [
        { key: "previous_archive_last_24h", outages: 1714, totalCustomers: 145285 },
        { key: "previous_archive_last_7d", outages: 14104, totalCustomers: 1234453 },
        { key: "previous_archive_last_30d", outages: 55277, totalCustomers: 4595713 },
        { key: "previous_archive_last_1y", outages: 234187, totalCustomers: 22290686 },
      ],
      territories: [{ territoryName: "Montréal", eventCount: 16785 }],
      largest: { customersAffected: 25018 },
    }),
    [],
  );
});

test("coherence checks catch a shorter window exceeding a longer one", () => {
  const problems = archiveSummaryIncoherences({
    windows: [
      { key: "previous_archive_last_30d", outages: 900, totalCustomers: 10 },
      { key: "previous_archive_last_1y", outages: 100, totalCustomers: 10 },
    ],
    territories: [],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /last_30d\.outages \(900\) exceeds/);
});

test("an empty or quiet summary raises nothing", () => {
  assert.deepEqual(archiveSummaryIncoherences({ windows: [], territories: [] }), []);
  assert.deepEqual(archiveSummaryIncoherences(null), []);
  assert.deepEqual(
    archiveSummaryIncoherences({
      windows: WINDOW_KEYS.map((key) => ({ key, outages: 0, totalCustomers: 0 })),
      territories: [],
      largest: null,
    }),
    [],
  );
});

// Review findings on the guards themselves, 2026-08-05.
test("a summary missing totalCustomers is rejected rather than half-checked", () => {
  // It previously passed the shape guard on `outages` alone, and then the
  // coherence checks read totalCustomers as 0 and reported the largest outage
  // as exceeding the year -- a false 503 on a public endpoint that pages the
  // half-hourly monitor.
  const summary = { windows: [{ key: "previous_archive_last_1y", outages: 10 }] };
  assert.equal(isUsableArchiveSummary(summary), false);
});

test("a summary with no windows is rejected", () => {
  // [].every() is true, so this used to be "usable": it rendered no window
  // grid and silently disabled every territory check, because the checks look
  // the annual window up by key and found nothing.
  assert.equal(isUsableArchiveSummary({ windows: [] }), false);
  assert.deepEqual(
    archiveSummaryIncoherences({
      windows: [],
      territories: [{ territoryName: "Somewhere", eventCount: 99999 }],
    }),
    [],
    "with no annual window there is nothing to compare against",
  );
});

test("a territory cannot peak above the largest single outage", () => {
  const base = {
    windows: [{ key: "previous_archive_last_1y", outages: 500, totalCustomers: 9000 }],
    largest: { customersAffected: 4116 },
  };
  assert.deepEqual(
    archiveSummaryIncoherences({
      ...base,
      territories: [{ territoryName: "Saint-Hyacinthe", customersAffected: 4116 }],
    }),
    [],
    "equality is the normal case: the top territory usually is the largest outage",
  );
  const problems = archiveSummaryIncoherences({
    ...base,
    territories: [{ territoryName: "Impossible", customersAffected: 4117 }],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Impossible peaks at 4117 customers, above the 4116/);
});
