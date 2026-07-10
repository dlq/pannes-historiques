export function municipalArchiveLatestRow(row) {
  return {
    key: "previous_archive_latest",
    startTime: row.sort_time || "",
    customersAffected: Number(row.max_customers || 0),
    territoryId: row.territory_id,
    territoryName: row.territory_name,
  };
}
