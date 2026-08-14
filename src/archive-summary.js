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
//
// Both numeric fields are required and an empty array is rejected, because the
// coherence checks below read `totalCustomers` as well and look the widest
// window up by key. A payload satisfying less than this would pass the guard
// and then give those checks nothing to compare.
export function isUsableArchiveSummary(summary) {
  if (!Array.isArray(summary?.windows) || summary.windows.length === 0) return false;
  return summary.windows.every(
    (window) => typeof window?.outages === "number" && typeof window?.totalCustomers === "number",
  );
}

// `source_cursor` identifies the newest municipal-archive row incorporated
// into a materialized summary. A valid JSON payload is not enough to serve: a
// newer cursor means the summary is a coherent but stale view of the archive.
// Keep this decision pure because both the request path and the public health
// probe must apply exactly the same rule.
export function archiveSummaryFreshnessProblem({
  storedCursor = "",
  currentCursor = "",
  hasSummary,
}) {
  if (!currentCursor) return null;
  if (!hasSummary) return "archive summary is missing for the current archive cursor";
  if (storedCursor !== currentCursor) {
    return "archive summary cursor does not match the current archive cursor";
  }
  return null;
}

// Both summary paths build this shape, and they diverged once already: the
// field was called `areas`, and one path filled it with an outage count while
// the other filled it with a territory count. Building it in one place makes
// that drift structurally impossible instead of something a test greps for.
export function archiveWindow(key, { outages, totalCustomers }) {
  return {
    key,
    outages: Number(outages || 0),
    totalCustomers: Number(totalCustomers || 0),
  };
}

// Windows run back from now, so each one contains the shorter ones. The widest
// is also the ceiling every territory figure is checked against, so it is named
// rather than repeated as a literal further down.
const YEAR_WINDOW = "previous_archive_last_1y";
const WINDOW_ORDER = [
  "previous_archive_last_24h",
  "previous_archive_last_7d",
  "previous_archive_last_30d",
  YEAR_WINDOW,
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
      const inner = Number(shorter[field] ?? 0);
      const outer = Number(longer[field] ?? 0);
      if (inner > outer) {
        problems.push(
          `${shorter.key}.${field} (${inner}) exceeds ${longer.key}.${field} (${outer}), ` +
            "but the shorter window is contained in the longer one",
        );
      }
    }
  }

  // Every territory figure is drawn from the same primary rows the summary
  // totals are, so each one has a ceiling elsewhere in the payload. A missing
  // ceiling means there is nothing to compare against, not a violation.
  const year = byKey.get(YEAR_WINDOW);
  const territories = Array.isArray(summary?.territories) ? summary.territories : [];
  const flagTerritoriesAbove = (field, ceiling, describe) => {
    if (typeof ceiling !== "number") return;
    for (const territory of territories) {
      const value = Number(territory?.[field] ?? 0);
      if (value > ceiling) {
        const name = territory?.territoryName || territory?.territoryId || "unknown";
        problems.push(`territory ${name} ${describe(value, ceiling)}`);
      }
    }
  };

  flagTerritoriesAbove(
    "eventCount",
    year?.outages,
    (value, ceiling) => `reports ${value} outages, more than the ${ceiling} in the whole year`,
  );
  // `largest` is the peak over every primary row and a territory's peak is the
  // maximum over its own subset of them. This binds tightly -- the top
  // territory usually IS the largest outage, so it holds at equality -- unlike
  // comparing that single outage against the year's cumulative sum, which had
  // roughly a thousandfold margin and so could never have failed.
  flagTerritoriesAbove(
    "customersAffected",
    summary?.largest?.customersAffected,
    (value, ceiling) =>
      `peaks at ${value} customers, above the ${ceiling} of the largest single outage`,
  );

  return problems;
}
