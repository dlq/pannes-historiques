export async function durableHydroResponse(env) {
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const outages = await latestRows(env.DB, "bis", "current_outage_records");
  const planned = await latestRows(env.DB, "aip", "current_planned_interruptions");
  return jsonResponse({ versions: versions.results || [], outages, planned });
}

export async function durableNearbyResponse(request, env) {
  const url = new URL(request.url);
  const latitude = numberParam(url, "lat");
  const longitude = numberParam(url, "lon");
  if (!validCoordinates(latitude, longitude)) {
    return jsonResponse({ error: "lat and lon query parameters are required" }, { status: 400 });
  }
  const radiusM = clamp(numberParam(url, "radius_m") ?? 5000, 100, 50000);
  const limit = Math.trunc(clamp(numberParam(url, "limit") ?? 100, 1, 500));
  const includeRaw = url.searchParams.get("include_raw") === "1";
  const bbox = boundingBox(latitude, longitude, radiusM);
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const versionMap = new Map((versions.results || []).map((row) => [row.source, row.version]));
  const [outageRows, plannedRows] = await Promise.all([
    nearbyOutageRows(env.DB, versionMap.get("bis"), bbox),
    nearbyPlannedRows(env.DB, versionMap.get("aip"), bbox),
  ]);
  const items = [
    ...outageRows.map((row) => nearbyOutageItem(row, latitude, longitude, includeRaw)),
    ...plannedRows.map((row) => nearbyPlannedItem(row, latitude, longitude, includeRaw)),
  ]
    .filter((item) => item.distance_m <= radiusM)
    .sort((left, right) => left.distance_m - right.distance_m)
    .slice(0, limit);
  return jsonResponse({
    query: { latitude, longitude, radius_m: radiusM, limit },
    versions: versions.results || [],
    count: items.length,
    items,
  });
}

export async function durableHistoryNearbyResponse(request, env) {
  const url = new URL(request.url);
  const latitude = numberParam(url, "lat");
  const longitude = numberParam(url, "lon");
  if (!validCoordinates(latitude, longitude)) {
    return jsonResponse({ error: "lat and lon query parameters are required" }, { status: 400 });
  }
  const radiusM = clamp(numberParam(url, "radius_m") ?? 5000, 100, 50000);
  const days = Math.trunc(clamp(numberParam(url, "days") ?? 1825, 1, 3650));
  const limit = Math.trunc(clamp(numberParam(url, "limit") ?? 250, 1, 1000));
  const bbox = boundingBox(latitude, longitude, radiusM);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await nearbyHistoryRows(env.DB, bbox, cutoff);
  const items = rows
    .map((row) => historyItem(row, latitude, longitude))
    .filter((item) => item.distance_m <= radiusM)
    .sort((left, right) => {
      const timeCompare = String(right.start_time || "").localeCompare(
        String(left.start_time || ""),
      );
      return timeCompare || left.distance_m - right.distance_m;
    })
    .slice(0, limit);
  return jsonResponse({
    query: { latitude, longitude, radius_m: radiusM, days, limit },
    count: items.length,
    items,
  });
}

export async function latestRows(db, source, tableName) {
  const version = await db
    .prepare("SELECT version FROM feed_versions WHERE source = ?")
    .bind(source)
    .first();
  if (!version) return [];
  const result = await db
    .prepare(`SELECT * FROM ${tableName} WHERE source_version = ? ORDER BY record_index`)
    .bind(version.version)
    .all();
  return result.results || [];
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function distanceMeters(latA, lonA, latB, lonB) {
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthRadiusM = 6_371_000;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLon = ((lonB - lonA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function numberParam(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function validCoordinates(latitude, longitude) {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function boundingBox(latitude, longitude, radiusM) {
  const latDelta = radiusM / 111_320;
  const lonScale = Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
  const lonDelta = radiusM / (111_320 * lonScale);
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLon: longitude - lonDelta,
    maxLon: longitude + lonDelta,
  };
}

async function nearbyHistoryRows(db, bbox, cutoff) {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM resolved_events
      WHERE outage_kind = 'outage'
        AND centroid_lat BETWEEN ? AND ?
        AND centroid_lon BETWEEN ? AND ?
        AND COALESCE(start_time, last_seen_at, '') >= ?
      `,
    )
    .bind(bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon, cutoff.slice(0, 19).replace("T", " "))
    .all();
  return result.results || [];
}

function historyItem(row, latitude, longitude) {
  return {
    kind: "outage_history",
    event_key: row.event_key,
    distance_m: Math.round(distanceMeters(latitude, longitude, row.centroid_lat, row.centroid_lon)),
    centroid_lat: row.centroid_lat,
    centroid_lon: row.centroid_lon,
    customers_affected: row.customers_max,
    customers_min: row.customers_min,
    customers_max: row.customers_max,
    record_count: row.record_count,
    start_time: row.start_time,
    end_time: row.end_time,
    interruption_type: row.interruption_type,
    status: row.status,
    municipality_code: row.municipality_code,
    source_versions: row.source_versions,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    updated_at: row.updated_at,
  };
}

async function nearbyOutageRows(db, version, bbox) {
  if (!version) return [];
  const result = await db
    .prepare(
      `
      SELECT *
      FROM current_outage_records
      WHERE source_version = ?
        AND centroid_lat BETWEEN ? AND ?
        AND centroid_lon BETWEEN ? AND ?
      `,
    )
    .bind(version, bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon)
    .all();
  return result.results || [];
}

async function nearbyPlannedRows(db, version, bbox) {
  if (!version) return [];
  const result = await db
    .prepare(
      `
      SELECT *
      FROM current_planned_interruptions
      WHERE source_version = ?
        AND centroid_lat BETWEEN ? AND ?
        AND centroid_lon BETWEEN ? AND ?
      `,
    )
    .bind(version, bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon)
    .all();
  return result.results || [];
}

function nearbyOutageItem(row, latitude, longitude, includeRaw) {
  const item = {
    kind: "outage",
    id: row.id,
    source_version: row.source_version,
    distance_m: Math.round(distanceMeters(latitude, longitude, row.centroid_lat, row.centroid_lon)),
    centroid_lat: row.centroid_lat,
    centroid_lon: row.centroid_lon,
    customers_affected: row.customers_affected,
    start_time: row.outage_start_time,
    estimated_restore_time: row.estimated_restore_time,
    interruption_type: row.interruption_type,
    status: row.status,
    municipality_code: row.municipality_code,
    updated_at: row.updated_at,
  };
  if (includeRaw) item.raw_record = JSON.parse(row.raw_record_json);
  return item;
}

function nearbyPlannedItem(row, latitude, longitude, includeRaw) {
  const item = {
    kind: "planned",
    id: row.id,
    source_version: row.source_version,
    distance_m: Math.round(distanceMeters(latitude, longitude, row.centroid_lat, row.centroid_lon)),
    centroid_lat: row.centroid_lat,
    centroid_lon: row.centroid_lon,
    notice_id: row.notice_id,
    customers_affected: row.customers_affected,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    actual_start: row.actual_start,
    actual_end: row.actual_end,
    status: row.status,
    municipality_code: row.municipality_code,
    updated_at: row.updated_at,
  };
  if (includeRaw) item.raw_record = JSON.parse(row.raw_record_json);
  return item;
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-pannes-runtime": "worker-d1",
      ...(init.headers || {}),
    },
  });
}
