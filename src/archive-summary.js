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
export function isUsableArchiveSummary(summary) {
  if (!Array.isArray(summary?.windows)) return false;
  return summary.windows.every((window) => typeof window?.outages === "number");
}
