import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assignPolygonToTerritories,
  pointInGeometry,
  simplifyGeometry,
  simplifyTerritoryCoverage,
  territoryFromFeature,
} from "../../src/municipal-archive.js";

const DATABASE = "pannes-historiques";
const TERRITORY_LAYER_URL =
  "https://servicescarto.mern.gouv.qc.ca/pes/rest/services/Territoire/SDA_WMS/MapServer/2/query";
const TERRITORY_SOURCE_LAYER = "donnees_quebec_sda_municipalite";
const TERRITORY_DISPLAY_MIN_WEIGHT = 0.00000002;
const TERRITORY_IMPORT_OFFSET = process.env.MUNICIPAL_ARCHIVE_TERRITORY_OFFSET || "0.005";
const POLYGON_BATCH_SIZE = Number(process.env.MUNICIPAL_ARCHIVE_BATCH_SIZE || 250);
const INSERT_CHUNK_SIZE = Number(process.env.MUNICIPAL_ARCHIVE_INSERT_CHUNK_SIZE || 100);
const MAX_SQL_STATEMENT_LENGTH = 100_000;

const mode = process.argv[2] || "backfill";

if (!["import-admin", "backfill", "status"].includes(mode)) {
  console.error("Usage: node scripts/maintenance/municipal-archive-backfill.mjs [import-admin|backfill|status]");
  process.exit(2);
}

if (mode === "import-admin") await importAdminTerritories();
if (mode === "backfill") await backfillMunicipalArchive();
if (mode === "status") printJson(await status());

async function importAdminTerritories() {
  const importedAt = new Date().toISOString();
  const url = new URL(TERRITORY_LAYER_URL);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("geometryPrecision", "6");
  url.searchParams.set("maxAllowableOffset", TERRITORY_IMPORT_OFFSET);
  url.searchParams.set("f", "geojson");

  const response = await fetch(url, {
    headers: { Accept: "application/geo+json, application/json" },
  });
  if (!response.ok) throw new Error(`territory import returned HTTP ${response.status}`);
  const payload = await response.json();
  const features = payload.features || [];
  const displayCollection = simplifyTerritoryCoverage(features, {
    minWeight: TERRITORY_DISPLAY_MIN_WEIGHT,
  });
  const territories = features.map((feature, index) =>
    territoryFromFeature(feature, {
      displayGeometry: displayCollection.features[index]?.geometry || feature.geometry,
    }),
  );

  const existingTerritories = new Set(
    (await d1Query("SELECT territory_id FROM admin_territories"))[0].results.map(
      (row) => row.territory_id,
    ),
  );
  let imported = existingTerritories.size;
  for (const territory of territories) {
    if (existingTerritories.has(territory.territory_id)) continue;
    await d1File(adminTerritorySql(territory, importedAt));
    imported += 1;
    if (imported % 50 === 0) {
      console.error(`admin territories imported: ${imported}/${territories.length}`);
    }
  }
  await d1File(buildStateSql("admin_territories_imported_at", importedAt, importedAt));

  printJson({
    imported: territories.length,
    source_layer: TERRITORY_SOURCE_LAYER,
    imported_at: importedAt,
  });
}

async function backfillMunicipalArchive() {
  const territories = (await d1Query("SELECT * FROM admin_territories ORDER BY territory_id"))[0]
    .results;
  if (!territories.length) {
    throw new Error("admin territories must be imported before municipal archive backfill");
  }
  const normalizedTerritories = territories.map((row) => ({
    ...row,
    territory_id: row.territory_id,
    code: row.code,
    name: row.name,
    designation: row.designation,
    mrc_code: row.mrc_code,
    mrc_name: row.mrc_name,
    region_code: row.region_code,
    region_name: row.region_name,
    bbox: {
      minLon: row.bbox_min_lon,
      minLat: row.bbox_min_lat,
      maxLon: row.bbox_max_lon,
      maxLat: row.bbox_max_lat,
    },
    geometry: JSON.parse(row.geometry_geojson),
  }));

  let afterId = process.env.MUNICIPAL_ARCHIVE_AFTER_ID || (await buildState("municipal_archive_last_polygon_id"));
  let totalPolygons = 0;
  let totalAssignments = 0;
  let batch = 0;
  let hasMore = true;
  while (hasMore) {
    const polygons = await fetchPolygonBatch(afterId, POLYGON_BATCH_SIZE);
    if (!polygons.length) break;
    batch += 1;
    const updatedAt = new Date().toISOString();
    const records = await fetchRecordsForVersions([...new Set(polygons.map((row) => row.source_version))]);
    const statements = [];
    for (const polygon of polygons) {
      const candidateTerritories = normalizedTerritories.filter((territory) =>
        bboxIntersectsRows(polygon, territory),
      );
      const assignments = assignPolygonToTerritories(polygon, candidateTerritories);
      const outageStats = outageStatsForPolygon(polygon, records);
      totalAssignments += assignments.length;
      for (const assignment of assignments) {
        statements.push(assignmentSql(assignment, outageStats, updatedAt));
      }
    }
    for (const statementChunk of chunks(statements, INSERT_CHUNK_SIZE)) {
      await d1File(statementChunk.join("\n"));
    }
    afterId = polygons.at(-1).id;
    await d1File(
      [
        buildStateSql("municipal_archive_last_polygon_id", afterId, updatedAt),
        buildStateSql("municipal_archive_last_backfill_at", updatedAt, updatedAt),
      ].join("\n"),
    );
    totalPolygons += polygons.length;
    hasMore = polygons.length === POLYGON_BATCH_SIZE;
    printJson({
      batch,
      polygons_processed: polygons.length,
      total_polygons: totalPolygons,
      assignments: statements.length,
      total_assignments: totalAssignments,
      last_polygon_id: afterId,
      has_more: hasMore,
    });
  }
  printJson(await status());
}

async function status() {
  const result = await d1Query(`
    SELECT COUNT(*) AS admin_territories FROM admin_territories;
    SELECT COUNT(*) AS bins FROM previous_outage_territory_bins;
    SELECT COUNT(*) AS primary_bins FROM previous_outage_territory_bins WHERE assignment_type = 'primary';
    SELECT COUNT(DISTINCT territory_id) AS primary_territories FROM previous_outage_territory_bins WHERE assignment_type = 'primary';
    SELECT * FROM municipal_archive_build_state ORDER BY state_key;
  `);
  return {
    admin_territories: result[0].results[0].admin_territories,
    bins: result[1].results[0].bins,
    primary_bins: result[2].results[0].primary_bins,
    primary_territories: result[3].results[0].primary_territories,
    state: result[4].results,
  };
}

async function buildState(key) {
  const result = await d1Query(
    `SELECT state_value FROM municipal_archive_build_state WHERE state_key = ${sqlString(key)} LIMIT 1`,
  );
  return result[0].results[0]?.state_value || "";
}

async function fetchPolygonBatch(afterId, limit) {
  const result = await d1Query(`
    SELECT *
    FROM hydro_polygon_geometries
    WHERE source_type = 'bispoly'
      ${afterId ? `AND id > ${sqlString(afterId)}` : ""}
    ORDER BY id
    LIMIT ${Number(limit)}
  `);
  return result[0].results || [];
}

async function fetchRecordsForVersions(versions) {
  if (!versions.length) return [];
  const quotedVersions = versions.map(sqlString).join(", ");
  const result = await d1Query(`
    SELECT source_version, customers_affected, outage_start_time, estimated_restore_time,
           centroid_lon, centroid_lat
    FROM current_outage_records
    WHERE source_version IN (${quotedVersions})
      AND centroid_lat IS NOT NULL
      AND centroid_lon IS NOT NULL
  `);
  return result[0].results || [];
}

function outageStatsForPolygon(polygon, records) {
  const geometry = JSON.parse(polygon.geometry_geojson);
  const matching = records.filter(
    (row) =>
      row.source_version === polygon.source_version &&
      row.centroid_lat >= polygon.bbox_min_lat &&
      row.centroid_lat <= polygon.bbox_max_lat &&
      row.centroid_lon >= polygon.bbox_min_lon &&
      row.centroid_lon <= polygon.bbox_max_lon &&
      pointInGeometry({ lon: row.centroid_lon, lat: row.centroid_lat }, geometry),
  );
  if (!matching.length) {
    const observedAt = hydroVersionTimestamp(polygon.source_version);
    return {
      eventCount: 1,
      maxCustomers: null,
      latestStartTime: observedAt,
      latestEndTime: null,
    };
  }
  matching.sort((left, right) =>
    String(right.outage_start_time || "").localeCompare(String(left.outage_start_time || "")),
  );
  return {
    eventCount: matching.length,
    maxCustomers: Math.max(...matching.map((row) => Number(row.customers_affected || 0))),
    latestStartTime: matching[0]?.outage_start_time || hydroVersionTimestamp(polygon.source_version),
    latestEndTime: matching[0]?.estimated_restore_time || null,
  };
}

function adminTerritorySql(territory, importedAt) {
  const geometryJson = JSON.stringify(territory.geometry);
  const displayGeometryJson = JSON.stringify(territory.display_geometry);
  const sql = (storedGeometryJson, storedDisplayGeometryJson = displayGeometryJson) => `
    INSERT INTO admin_territories
    (territory_id, source_layer, source_object_id, code, name, normalized_name,
     designation, designation_code, mrc_code, mrc_name, region_code, region_name,
     source_version, area_km2, centroid_lon, centroid_lat, bbox_min_lon, bbox_min_lat,
     bbox_max_lon, bbox_max_lat, geometry_geojson, display_geometry_geojson,
     imported_at, updated_at)
    VALUES (${[
      territory.territory_id,
      TERRITORY_SOURCE_LAYER,
      String(territory.source_object_id || ""),
      territory.code,
      territory.name,
      territory.normalized_name,
      territory.designation,
      territory.designation_code,
      territory.mrc_code,
      territory.mrc_name,
      territory.region_code,
      territory.region_name,
      territory.version,
      territory.area_km2,
      territory.centroid_lon,
      territory.centroid_lat,
      territory.bbox?.minLon,
      territory.bbox?.minLat,
      territory.bbox?.maxLon,
      territory.bbox?.maxLat,
      storedGeometryJson,
      storedDisplayGeometryJson,
      importedAt,
      importedAt,
    ]
      .map(sqlValue)
      .join(", ")})
    ON CONFLICT(territory_id) DO UPDATE SET
      source_object_id = excluded.source_object_id,
      code = excluded.code,
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      designation = excluded.designation,
      designation_code = excluded.designation_code,
      mrc_code = excluded.mrc_code,
      mrc_name = excluded.mrc_name,
      region_code = excluded.region_code,
      region_name = excluded.region_name,
      source_version = excluded.source_version,
      area_km2 = excluded.area_km2,
      centroid_lon = excluded.centroid_lon,
      centroid_lat = excluded.centroid_lat,
      bbox_min_lon = excluded.bbox_min_lon,
      bbox_min_lat = excluded.bbox_min_lat,
      bbox_max_lon = excluded.bbox_max_lon,
      bbox_max_lat = excluded.bbox_max_lat,
      geometry_geojson = excluded.geometry_geojson,
      display_geometry_geojson = excluded.display_geometry_geojson,
      imported_at = excluded.imported_at,
      updated_at = excluded.updated_at;
  `;
  const rawSql = sql(geometryJson, displayGeometryJson);
  if (rawSql.length <= MAX_SQL_STATEMENT_LENGTH) return rawSql;

  const displaySql = sql(displayGeometryJson, displayGeometryJson);
  if (displaySql.length <= MAX_SQL_STATEMENT_LENGTH) return displaySql;

  for (const tolerance of [0.01, 0.05, 0.1, 0.25]) {
    const simplifiedJson = JSON.stringify(simplifyGeometry(territory.display_geometry, tolerance));
    const simplifiedSql = sql(simplifiedJson, simplifiedJson);
    if (simplifiedSql.length <= MAX_SQL_STATEMENT_LENGTH) return simplifiedSql;
  }

  const bboxJson = JSON.stringify(bboxGeometry(territory.bbox));
  return sql(bboxJson, bboxJson);
}

function assignmentSql(assignment, outageStats, updatedAt) {
  const observedAt = hydroVersionTimestamp(assignment.source_version) || updatedAt;
  return `
    INSERT INTO previous_outage_territory_bins
    (id, hydro_polygon_id, source_type, source_version, polygon_id, territory_id,
     assignment_type, territory_code, territory_name, designation, mrc_code, mrc_name,
     region_code, region_name, centroid_lon, centroid_lat, first_seen_at, last_seen_at,
     event_count, max_customers, latest_start_time, latest_end_time, updated_at)
    VALUES (${[
      assignment.id,
      assignment.hydro_polygon_id,
      assignment.source_type,
      assignment.source_version,
      assignment.polygon_id,
      assignment.territory_id,
      assignment.assignment_type,
      assignment.territory_code,
      assignment.territory_name,
      assignment.designation,
      assignment.mrc_code,
      assignment.mrc_name,
      assignment.region_code,
      assignment.region_name,
      assignment.centroid_lon,
      assignment.centroid_lat,
      observedAt,
      observedAt,
      outageStats.eventCount,
      outageStats.maxCustomers,
      outageStats.latestStartTime || observedAt,
      outageStats.latestEndTime,
      updatedAt,
    ]
      .map(sqlValue)
      .join(", ")})
    ON CONFLICT(id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      event_count = excluded.event_count,
      max_customers = excluded.max_customers,
      latest_start_time = excluded.latest_start_time,
      latest_end_time = excluded.latest_end_time,
      updated_at = excluded.updated_at;
  `;
}

function buildStateSql(key, value, updatedAt) {
  return `
    INSERT INTO municipal_archive_build_state (state_key, state_value, updated_at)
    VALUES (${sqlString(key)}, ${sqlString(value)}, ${sqlString(updatedAt)})
    ON CONFLICT(state_key) DO UPDATE SET
      state_value = excluded.state_value,
      updated_at = excluded.updated_at;
  `;
}

function bboxIntersectsRows(polygon, territory) {
  return (
    polygon.bbox_min_lon <= territory.bbox.maxLon &&
    polygon.bbox_max_lon >= territory.bbox.minLon &&
    polygon.bbox_min_lat <= territory.bbox.maxLat &&
    polygon.bbox_max_lat >= territory.bbox.minLat
  );
}

function hydroVersionTimestamp(version) {
  const text = String(version || "");
  if (!/^\d{14}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(
    8,
    10,
  )}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
}

function bboxGeometry(bbox) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [bbox.minLon, bbox.minLat],
        [bbox.maxLon, bbox.minLat],
        [bbox.maxLon, bbox.maxLat],
        [bbox.minLon, bbox.maxLat],
        [bbox.minLon, bbox.minLat],
      ],
    ],
  };
}

async function d1Query(command) {
  const stdout = withRetries(() =>
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", command],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 128 },
    ),
  );
  return JSON.parse(stdout);
}

async function d1File(sql) {
  const dir = mkdtempSync(join(tmpdir(), "pannes-municipal-archive-"));
  const file = join(dir, "batch.sql");
  writeFileSync(file, sql);
  withRetries(() =>
    execFileSync("npx", ["wrangler", "d1", "execute", DATABASE, "--remote", "--file", file], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

function withRetries(callback, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return callback();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const waitMs = 1000 * attempt ** 2;
      console.error(`D1 operation failed; retrying in ${waitMs}ms (${attempt}/${attempts})`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  throw lastError;
}

function sqlValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NULL";
  if (typeof value === "number") return String(value);
  return sqlString(value);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
