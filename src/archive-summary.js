export function municipalArchiveLatestRow(row) {
  return {
    key: "previous_archive_latest",
    startTime: row.sort_time || "",
    customersAffected: Number(row.max_customers || 0),
    territoryId: row.territory_id,
    territoryName: row.territory_name,
  };
}

// A stored summary outlives the code that wrote it. When the payload shape
// changes, reading it back verbatim renders whatever the new template asks for
// as missing -- every window silently showing 0 rather than an error. Callers
// treat false as a cache miss and rebuild, so a shape change heals itself on
// the first request after deploy.
// Both numeric fields are required, not just `outages`: the coherence checks
// below read `totalCustomers` too, and a payload carrying one without the other
// would pass this guard and then fail those. An empty array is rejected for the
// same reason -- every builder emits one window per key, so no windows means a
// malformed payload rather than a quiet period, and it would leave the checks
// with nothing to compare.
export function isUsableArchiveSummary(summary) {
  if (!Array.isArray(summary?.windows) || summary.windows.length === 0) return false;
  return summary.windows.every(
    (window) => typeof window?.outages === "number" && typeof window?.totalCustomers === "number",
  );
}

// Windows run back from now, so each one contains the shorter ones.
const WINDOW_ORDER = [
  "previous_archive_last_24h",
  "previous_archive_last_7d",
  "previous_archive_last_30d",
  "previous_archive_last_1y",
];

// Cross-field checks on a built summary. These compare the payload against
// itself rather than against an expected value, so they hold for any real data
// and need no threshold to tune.
//
// They exist because the window cell spent its whole life reporting a count of
// municipalities under a heading that says outages, and no test noticed: every
// test asserted the number equalled what the query returned, and the query
// returned exactly what it was asked for. What was never checked is that the
// numbers on one card agree with each other. Montreal's row read 16 785
// outages while the 1 an window read 1 139 total -- a part larger than the
// whole, visible on screen, for months.
export function archiveSummaryIncoherences(summary) {
  const problems = [];
  const windows = Array.isArray(summary?.windows) ? summary.windows : [];
  const byKey = new Map(windows.map((window) => [window?.key, window]));
  const ordered = WINDOW_ORDER.map((key) => byKey.get(key)).filter(Boolean);

  for (let i = 1; i < ordered.length; i += 1) {
    const shorter = ordered[i - 1];
    const longer = ordered[i];
    for (const field of ["outages", "totalCustomers"]) {
      const inner = Number(shorter?.[field] ?? 0);
      const outer = Number(longer?.[field] ?? 0);
      if (inner > outer) {
        problems.push(
          `${shorter.key}.${field} (${inner}) exceeds ${longer.key}.${field} (${outer}), ` +
            "but the shorter window is contained in the longer one",
        );
      }
    }
  }

  // The territory list is drawn from the same one-year cutoff as the widest
  // window, so no single territory can hold more outages than the year.
  const year = byKey.get("previous_archive_last_1y");
  const territories = Array.isArray(summary?.territories) ? summary.territories : [];
  if (year && typeof year.outages === "number") {
    for (const territory of territories) {
      const events = Number(territory?.eventCount ?? 0);
      if (events > year.outages) {
        problems.push(
          `territory ${territory?.territoryName || territory?.territoryId} reports ` +
            `${events} outages, more than the ${year.outages} in the whole year`,
        );
      }
    }
  }

  // `largest` is the peak over every primary row, and a territory's
  // customersAffected is the peak over its own subset of those rows, so no
  // territory can exceed it. This binds tightly -- the top territory usually
  // IS the largest outage, making it equality rather than slack -- which is
  // why it replaced a comparison of the largest single outage against the
  // year's cumulative sum. That one held with roughly a thousandfold margin
  // and so could never have failed on anything.
  const largest = summary?.largest?.customersAffected;
  if (typeof largest === "number") {
    for (const territory of territories) {
      const peak = Number(territory?.customersAffected ?? 0);
      if (peak > largest) {
        problems.push(
          `territory ${territory?.territoryName || territory?.territoryId} peaks at ` +
            `${peak} customers, above the ${largest} of the largest single outage`,
        );
      }
    }
  }

  return problems;
}
