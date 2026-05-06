import { Container } from "@cloudflare/containers";

const HYDRO_ROOT = "https://pannes.hydroquebec.com/pannes/donnees/v3_0";
const DISCLOSURE_CRONS = new Set(["0 10 */14 * *", "13 10 */14 * *"]);

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";
  envVars = {
    APP_HOST: "0.0.0.0",
    APP_PORT: "8080",
    AUTO_REFRESH_ON_SEARCH: "0",
    DURABLE_NEARBY_URL: "https://pannes.ca/api/durable/nearby",
    NOMINATIM_USER_AGENT: "pannes-historiques/0.1 (+https://pannes.ca)",
  };

  onStart() {
    console.log("Pannes container started");
  }

  onStop() {
    console.log("Pannes container stopped");
  }

  onError(error) {
    console.error("Pannes container error", error);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/cron/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api/durable/hydro") {
      return durableHydroResponse(env);
    }
    if (url.pathname === "/api/durable/status") {
      return durableStatusResponse(env);
    }
    if (url.pathname === "/api/durable/nearby") {
      return durableNearbyResponse(request, env);
    }
    return fetchContainer(request, env);
  },

  async scheduled(controller, env, ctx) {
    if (DISCLOSURE_CRONS.has(controller.cron)) {
      ctx.waitUntil(callContainerCron(env, "/cron/disclosures"));
    } else {
      ctx.waitUntil(runHydroSchedule(env));
    }
  },
};

async function fetchContainer(request, env) {
  const started = Date.now();
  const url = new URL(request.url);
  const container = env.PANNES_CONTAINER.getByName("web");
  const response = await container.fetch(request);
  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify({
      event: "worker_container_fetch_timing",
      method: request.method,
      path: url.pathname,
      status: response.status,
      elapsed_ms: elapsedMs,
      cf_ray: request.headers.get("cf-ray"),
      colo: request.cf?.colo,
    }),
  );
  const headers = new Headers(response.headers);
  headers.set("X-Pannes-Worker-Container-Fetch-Ms", String(elapsedMs));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function runHydroSchedule(env) {
  const started = new Date().toISOString();
  const run = await recordRunStarted(env.DB, "hydro_changed", started);
  const summary = { d1: null, container: null };
  try {
    summary.d1 = await ingestChangedHydro(env);
    summary.container = await callContainerCron(env, "/cron/hydro");
    await recordRunFinished(env.DB, run.meta.last_row_id, "ok", summary);
  } catch (error) {
    summary.error = String(error?.stack || error);
    await recordRunFinished(env.DB, run.meta.last_row_id, "error", summary);
    throw error;
  }
}

async function callContainerCron(env, path) {
  const container = env.PANNES_CONTAINER.getByName("web");
  const response = await container.fetch(
    new Request(`https://pannes.ca${path}`, {
      method: "POST",
      headers: { "X-Cloudflare-Scheduled": "1" },
    }),
  );
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (_error) {
    // Keep non-JSON responses as text.
  }
  return { status: response.status, body };
}

async function ingestChangedHydro(env) {
  const results = [];
  for (const source of ["bis", "aip"]) {
    results.push(await ingestSourceIfChanged(env, source));
  }
  return results;
}

async function ingestSourceIfChanged(env, source) {
  const checkedAt = new Date().toISOString();
  const versionPayload = await fetchArrayBuffer(`${HYDRO_ROOT}/${source}version.json`);
  const version = parseVersion(decodeUtf8(versionPayload.bytes));
  const existing = await env.DB.prepare("SELECT version FROM feed_versions WHERE source = ?")
    .bind(source)
    .first();
  if (existing?.version === version) {
    await env.DB.prepare("UPDATE feed_versions SET checked_at = ? WHERE source = ?")
      .bind(checkedAt, source)
      .run();
    return { source, version, changed: false };
  }

  const markerType = `${source}markers`;
  const polyType = `${source}poly`;
  const markers = await fetchArrayBuffer(`${HYDRO_ROOT}/${markerType}${version}.json`);
  const poly = await fetchArrayBuffer(`${HYDRO_ROOT}/${polyType}${version}.kmz`);
  await storeSnapshot(env, `${source}version`, version, versionPayload, "json");
  await storeSnapshot(env, markerType, version, markers, "json");
  await storeSnapshot(env, polyType, version, poly, "kmz");

  if (source === "bis") {
    const count = await ingestBisMarkers(env.DB, version, decodeUtf8(markers.bytes), checkedAt);
    await upsertFeedVersion(env.DB, source, version, checkedAt);
    return { source, version, changed: true, records: count };
  }
  const count = await ingestAipMarkers(env.DB, version, decodeUtf8(markers.bytes), checkedAt);
  await upsertFeedVersion(env.DB, source, version, checkedAt);
  return { source, version, changed: true, records: count };
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)" },
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return {
    bytes,
    status: response.status,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

function decodeUtf8(buffer) {
  return new TextDecoder().decode(buffer);
}

function parseVersion(text) {
  const payload = JSON.parse(text);
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object")
    return String(payload.version || Object.values(payload)[0]);
  throw new Error("Unexpected Hydro-Quebec version payload");
}

async function storeSnapshot(env, sourceType, version, payload, extension) {
  const fetchedAt = new Date().toISOString();
  const digest = await sha256Hex(payload.bytes);
  const dated = fetchedAt.slice(0, 10);
  const r2Key =
    extension === "json" && sourceType.endsWith("version")
      ? `hydro_quebec/${sourceType}/date=${dated}/time=${fetchedAt.replaceAll(":", "-")}.${extension}`
      : `hydro_quebec/${sourceType}/version=${version}.${extension}`;
  if (env.RAW_BUCKET) {
    await env.RAW_BUCKET.put(r2Key, payload.bytes, {
      httpMetadata: { contentType: payload.contentType },
      customMetadata: { sourceType, version, sha256: digest },
    });
  }
  await env.DB.prepare(
    `
    INSERT OR REPLACE INTO hydro_snapshots
    (id, source_type, source_version, fetched_at, r2_key, content_type, sha256, http_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      `${sourceType}:${version}:${digest}`,
      sourceType,
      version,
      fetchedAt,
      env.RAW_BUCKET ? r2Key : null,
      payload.contentType,
      digest,
      payload.status,
    )
    .run();
}

async function ingestBisMarkers(db, version, text, updatedAt) {
  const payload = JSON.parse(text);
  const rows = Array.isArray(payload) ? payload : payload.pannes || [];
  const statements = rows.map((record, index) => {
    const [centroidLon, centroidLat] = parseCentroid(safeGet(record, 4));
    return db
      .prepare(
        `
        INSERT OR REPLACE INTO current_outage_records
        (id, source_version, record_index, customers_affected, outage_start_time,
         estimated_restore_time, interruption_type, status, cause_group_code,
         cause_detail_code, municipality_code, centroid_lon, centroid_lat, raw_record_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `bis:${version}:${index}`,
        version,
        index,
        maybeInt(safeGet(record, 0)),
        safeGet(record, 1),
        safeGet(record, 2),
        safeGet(record, 3),
        safeGet(record, 5),
        safeGet(record, 6),
        safeGet(record, 7),
        safeGet(record, 8),
        centroidLon,
        centroidLat,
        JSON.stringify(record),
        updatedAt,
      );
  });
  await batchInChunks(db, statements);
  await upsertResolvedEvents(db, "outage", version, rows, updatedAt);
  return rows.length;
}

async function ingestAipMarkers(db, version, text, updatedAt) {
  const payload = JSON.parse(text);
  const rows = Array.isArray(payload) ? payload : payload.interruptions || [];
  const statements = rows.map((record, index) => {
    const [centroidLon, centroidLat] = parseCentroid(safeGet(record, 15));
    return db
      .prepare(
        `
        INSERT OR REPLACE INTO current_planned_interruptions
        (id, source_version, record_index, notice_id, scheduled_start, scheduled_end,
         actual_start, actual_end, postponed_start, postponed_end, rescheduled_start,
         rescheduled_end, customers_affected, municipality_code, status, centroid_lon,
         centroid_lat, raw_record_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `aip:${version}:${index}`,
        version,
        index,
        safeGet(record, 1),
        safeGet(record, 2),
        safeGet(record, 3),
        safeGet(record, 4),
        safeGet(record, 5),
        safeGet(record, 6),
        safeGet(record, 7),
        safeGet(record, 8),
        safeGet(record, 9),
        maybeInt(safeGet(record, 10)),
        safeGet(record, 13),
        safeGet(record, 14),
        centroidLon,
        centroidLat,
        JSON.stringify(record),
        updatedAt,
      );
  });
  await batchInChunks(db, statements);
  await upsertResolvedEvents(db, "planned", version, rows, updatedAt);
  return rows.length;
}

async function upsertResolvedEvents(db, outageKind, version, rows, updatedAt) {
  const statements = rows.map((record) => {
    const isOutage = outageKind === "outage";
    const [centroidLon, centroidLat] = parseCentroid(safeGet(record, isOutage ? 4 : 15));
    const startTime = safeGet(record, isOutage ? 1 : 2) || "";
    const endTime = safeGet(record, isOutage ? 2 : 3) || "";
    const municipality = safeGet(record, isOutage ? 8 : 13) || "";
    const interruptionType = isOutage ? safeGet(record, 3) || "" : "AIP";
    const customers = maybeInt(safeGet(record, isOutage ? 0 : 10));
    const status = safeGet(record, isOutage ? 5 : 14) || "";
    const key = eventKey(
      outageKind,
      municipality,
      centroidLat,
      centroidLon,
      interruptionType,
      startTime,
    );
    return db
      .prepare(
        `
        INSERT INTO resolved_events
        (event_key, outage_kind, first_seen_at, last_seen_at, start_time, end_time,
         municipality_code, centroid_lon, centroid_lat, customers_min, customers_max,
         record_count, interruption_type, status, source_versions, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_key) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          customers_min = MIN(COALESCE(resolved_events.customers_min, excluded.customers_min), COALESCE(excluded.customers_min, resolved_events.customers_min)),
          customers_max = MAX(COALESCE(resolved_events.customers_max, excluded.customers_max), COALESCE(excluded.customers_max, resolved_events.customers_max)),
          record_count = resolved_events.record_count + 1,
          status = excluded.status,
          source_versions = CASE
            WHEN instr(',' || resolved_events.source_versions || ',', ',' || excluded.source_versions || ',') > 0
            THEN resolved_events.source_versions
            ELSE resolved_events.source_versions || ',' || excluded.source_versions
          END,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        key,
        outageKind,
        updatedAt,
        updatedAt,
        startTime,
        endTime,
        municipality,
        centroidLon,
        centroidLat,
        customers,
        customers,
        1,
        interruptionType,
        status,
        version,
        updatedAt,
      );
  });
  await batchInChunks(db, statements);
}

async function batchInChunks(db, statements) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

async function upsertFeedVersion(db, source, version, checkedAt) {
  await db
    .prepare(
      `
      INSERT INTO feed_versions (source, version, checked_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        version = excluded.version,
        checked_at = excluded.checked_at,
        updated_at = excluded.updated_at
      `,
    )
    .bind(source, version, checkedAt, checkedAt)
    .run();
}

async function durableHydroResponse(env) {
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const outages = await latestRows(env.DB, "bis", "current_outage_records");
  const planned = await latestRows(env.DB, "aip", "current_planned_interruptions");
  return jsonResponse({ versions: versions.results || [], outages, planned });
}

async function durableStatusResponse(env) {
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const runs = await env.DB.prepare(
    "SELECT * FROM ingestion_runs ORDER BY started_at DESC, id DESC LIMIT 10",
  ).all();
  return jsonResponse({ versions: versions.results || [], runs: runs.results || [] });
}

async function durableNearbyResponse(request, env) {
  const url = new URL(request.url);
  const latitude = numberParam(url, "lat");
  const longitude = numberParam(url, "lon");
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
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

async function latestRows(db, source, tableName) {
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

async function recordRunStarted(db, jobName, startedAt) {
  return db
    .prepare(
      "INSERT INTO ingestion_runs (job_name, started_at, status, summary_json) VALUES (?, ?, ?, ?)",
    )
    .bind(jobName, startedAt, "running", "{}")
    .run();
}

async function recordRunFinished(db, runId, status, summary) {
  return db
    .prepare("UPDATE ingestion_runs SET finished_at = ?, status = ?, summary_json = ? WHERE id = ?")
    .bind(new Date().toISOString(), status, JSON.stringify(summary), runId)
    .run();
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function safeGet(values, index) {
  return Array.isArray(values) && index < values.length ? values[index] : null;
}

function maybeInt(value) {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCentroid(raw) {
  if (!raw) return [null, null];
  if (Array.isArray(raw) && raw.length >= 2) return [Number(raw[0]), Number(raw[1])];
  if (typeof raw === "string") {
    const parts = raw.trim().replace(/^\[/, "").replace(/\]$/, "").split(",");
    if (parts.length >= 2) return [Number(parts[0]), Number(parts[1])];
  }
  return [null, null];
}

function numberParam(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function distanceMeters(latA, lonA, latB, lonB) {
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthRadiusM = 6_371_000;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLon = ((lonB - lonA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function eventKey(outageKind, municipality, centroidLat, centroidLon, interruptionType, startTime) {
  const roundedLat = Number.isFinite(centroidLat) ? centroidLat.toFixed(3) : "0.000";
  const roundedLon = Number.isFinite(centroidLon) ? centroidLon.toFixed(3) : "0.000";
  const timeBucket = String(startTime || "").slice(0, 16);
  return `${outageKind}|${municipality || ""}|${roundedLat}|${roundedLon}|${interruptionType || ""}|${timeBucket}`;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
