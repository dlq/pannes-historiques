import { Container } from "@cloudflare/containers";

const HYDRO_ROOT = "https://pannes.hydroquebec.com/pannes/donnees/v3_0";
const DISCLOSURE_CRONS = new Set(["0 10 */14 * *", "13 10 */14 * *"]);
const DISCLOSURE_BATCH_SIZE = 1;
const DISCLOSURE_RUN_BUDGET_MS = 90_000;
const DISCLOSURE_SOURCE_TIMEOUT_MS = 45_000;
const DISCLOSURE_SOURCE_DEFER_MS = 24 * 60 * 60 * 1000;

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";
  envVars = {
    APP_HOST: "0.0.0.0",
    APP_PORT: "8080",
    AUTO_REFRESH_ON_SEARCH: "0",
    DURABLE_HISTORY_URL: "https://pannes.ca/api/durable/history-nearby",
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
    if (url.pathname.startsWith("/internal/")) {
      return new Response("Not found", { status: 404 });
    }
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
    if (url.pathname === "/api/durable/history-nearby") {
      return durableHistoryNearbyResponse(request, env);
    }
    return fetchContainer(request, env);
  },

  async scheduled(controller, env, ctx) {
    if (DISCLOSURE_CRONS.has(controller.cron)) {
      ctx.waitUntil(runDisclosureSchedule(env));
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
  const summary = { d1: null, container: null, errors: [] };
  try {
    summary.container = await callContainerCron(env, "/cron/hydro");
    summary.d1 = await syncHydroFromContainerResult(env, summary.container);
  } catch (error) {
    summary.errors.push({ step: "container_hydro_sync", error: String(error?.stack || error) });
  }
  const status = summary.errors.length ? "error" : "ok";
  await recordRunFinished(env.DB, run.meta.last_row_id, status, summary);
  if (summary.errors.length) console.error("Hydro schedule completed with errors", summary);
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

async function syncHydroFromContainerResult(env, containerResult) {
  if (!containerResult || containerResult.status !== 200) {
    throw new Error(`container hydro returned HTTP ${containerResult?.status ?? "unknown"}`);
  }
  const body = containerResult.body || {};
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`container hydro errors: ${JSON.stringify(body.errors)}`);
  }
  const snapshots = body.snapshots || [];
  const results = [];
  for (const sourceInfo of body.sources || []) {
    results.push(await syncHydroSourceFromContainer(env, sourceInfo, snapshots));
  }
  return results;
}

async function syncHydroSourceFromContainer(env, sourceInfo, snapshots) {
  const checkedAt = new Date().toISOString();
  const source = sourceInfo.source;
  const version = sourceInfo.version;
  if (!source || !version) return { source, version, changed: false, skipped: "missing_version" };
  if (!sourceInfo.changed) {
    await upsertFeedVersion(env.DB, source, version, checkedAt);
    return { source, version, changed: false };
  }

  const relevantSnapshots = snapshots.filter(
    (snapshot) =>
      snapshot.version === version &&
      [`${source}version`, `${source}markers`, `${source}poly`].includes(snapshot.source_type),
  );
  const markerSnapshot = relevantSnapshots.find(
    (snapshot) => snapshot.source_type === `${source}markers`,
  );
  if (!markerSnapshot) {
    throw new Error(`container hydro summary did not include ${source} marker snapshot`);
  }

  let markerPayload = null;
  for (const snapshot of relevantSnapshots) {
    const payload = await fetchContainerRawSnapshot(env, snapshot);
    await storeSnapshot(
      env,
      snapshot.source_type,
      snapshot.version,
      payload,
      snapshotExtension(snapshot.source_type),
    );
    if (snapshot.source_type === `${source}markers`) markerPayload = payload;
  }

  if (!markerPayload) throw new Error(`container hydro did not provide ${source} marker payload`);
  const count =
    source === "bis"
      ? await ingestBisMarkers(env.DB, version, decodeUtf8(markerPayload.bytes), checkedAt)
      : await ingestAipMarkers(env.DB, version, decodeUtf8(markerPayload.bytes), checkedAt);
  await upsertFeedVersion(env.DB, source, version, checkedAt);
  return { source, version, changed: true, records: count };
}

async function fetchContainerRawSnapshot(env, snapshot) {
  const container = env.PANNES_CONTAINER.getByName("web");
  const url = new URL("https://pannes.ca/internal/raw-snapshot");
  url.searchParams.set("payload_path", snapshot.payload_path);
  const response = await container.fetch(
    new Request(url, {
      headers: {
        Accept: "*/*",
        "X-Cloudflare-Internal": "1",
      },
    }),
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`raw snapshot returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return {
    bytes: await response.arrayBuffer(),
    status: response.status,
    contentType:
      response.headers.get("content-type") || snapshot.content_type || "application/octet-stream",
  };
}

function snapshotExtension(sourceType) {
  return sourceType.endsWith("poly") ? "kmz" : "json";
}

async function callContainerJson(env, path) {
  const container = env.PANNES_CONTAINER.getByName("web");
  const response = await container.fetch(
    new Request(`https://pannes.ca${path}`, {
      headers: {
        Accept: "application/json",
        "X-Cloudflare-Internal": "1",
      },
    }),
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function callContainerJsonPost(env, path, payload, { timeoutMs } = {}) {
  const container = env.PANNES_CONTAINER.getByName("web");
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(`timed out after ${timeoutMs}ms`), timeoutMs)
    : null;
  try {
    const response = await container.fetch(
      new Request(`https://pannes.ca${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Cloudflare-Scheduled": "1",
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      }),
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runDisclosureSchedule(env) {
  await runDisclosureBatchJob(env, {
    jobName: "disclosures",
    batchSize: DISCLOSURE_BATCH_SIZE,
    budgetMs: DISCLOSURE_RUN_BUDGET_MS,
  });
}

async function runDisclosureBatchJob(
  env,
  { jobName, batchSize, budgetMs, maxBatches = Number.POSITIVE_INFINITY },
) {
  const started = new Date().toISOString();
  const run = await recordRunStarted(env.DB, jobName, started);
  const summary = { batches: [], total_sources: 0, total_events: 0, total_errors: 0 };
  try {
    const deadline = Date.now() + budgetMs;
    const attempted = new Set();
    while (Date.now() < deadline && summary.batches.length < maxBatches) {
      const candidateSourceKeys = (await dueDisclosureSourceKeys(env.DB, 100)).filter(
        (sourceKey) => !attempted.has(sourceKey),
      );
      candidateSourceKeys.splice(batchSize);
      if (!candidateSourceKeys.length) {
        summary.done = true;
        break;
      }
      for (const sourceKey of candidateSourceKeys) attempted.add(sourceKey);
      await markDisclosureSourceAttempt(env.DB, candidateSourceKeys);
      let container = null;
      try {
        container = await callContainerJsonPost(
          env,
          "/cron/disclosures/batch",
          {
            source_keys: candidateSourceKeys,
          },
          { timeoutMs: DISCLOSURE_SOURCE_TIMEOUT_MS },
        );
      } catch (error) {
        const errorText = String(error?.stack || error);
        await markDisclosureSourceError(env.DB, candidateSourceKeys, errorText);
        summary.batches.push({ source_keys: candidateSourceKeys, error: errorText });
        summary.total_errors += candidateSourceKeys.length;
        continue;
      }
      const exportPayload = await callContainerDisclosureExport(env, candidateSourceKeys);
      const d1 = await syncDisclosures(env, exportPayload);
      summary.batches.push({ source_keys: candidateSourceKeys, container, d1 });
      summary.total_sources += d1.sources;
      summary.total_events += d1.events;
      summary.total_errors += d1.source_file_errors.length + (container.errors || []).length;
      if ((container.errors || []).length) break;
    }
    if (!summary.done) {
      const remaining = await dueDisclosureSourceKeys(env.DB, 1);
      summary.remaining = remaining.length ? "yes" : "no";
    }
    await recordRunFinished(env.DB, run.meta.last_row_id, "ok", summary);
    return summary;
  } catch (error) {
    summary.error = String(error?.stack || error);
    await recordRunFinished(env.DB, run.meta.last_row_id, "error", summary);
    throw error;
  }
}

async function dueDisclosureSourceKeys(db, limit) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `
      SELECT source_key
      FROM disclosure_sources
      WHERE (r2_key IS NULL
         OR fetched_at IS NULL
         OR fetched_at < ?)
        AND (archival_deferred_until IS NULL OR archival_deferred_until <= ?)
      ORDER BY
        CASE WHEN r2_key IS NULL THEN 0 ELSE 1 END,
        archival_attempt_count,
        COALESCE(fetched_at, ''),
        dai_number
      LIMIT ?
      `,
    )
    .bind(cutoff, now, limit)
    .all();
  return (result.results || []).map((row) => row.source_key).filter(Boolean);
}

async function markDisclosureSourceAttempt(db, sourceKeys) {
  const attemptedAt = new Date().toISOString();
  const statements = sourceKeys.map((sourceKey) =>
    db
      .prepare(
        `
        UPDATE disclosure_sources
        SET archival_attempt_count = COALESCE(archival_attempt_count, 0) + 1,
            archival_last_attempt_at = ?,
            archival_deferred_until = NULL
        WHERE source_key = ?
        `,
      )
      .bind(attemptedAt, sourceKey),
  );
  await batchInChunks(db, statements);
}

async function markDisclosureSourceError(db, sourceKeys, errorText) {
  const attemptedAt = new Date().toISOString();
  const deferredUntil = new Date(Date.now() + DISCLOSURE_SOURCE_DEFER_MS).toISOString();
  const statements = sourceKeys.map((sourceKey) =>
    db
      .prepare(
        `
        UPDATE disclosure_sources
        SET archival_last_attempt_at = ?,
            archival_last_error = ?,
            archival_deferred_until = ?
        WHERE source_key = ?
        `,
      )
      .bind(attemptedAt, errorText.slice(0, 1000), deferredUntil, sourceKey),
  );
  await batchInChunks(db, statements);
}

async function callContainerDisclosureExport(env, sourceKeys) {
  const path = new URL("https://pannes.ca/internal/disclosures/export");
  for (const sourceKey of sourceKeys) path.searchParams.append("source_key", sourceKey);
  return callContainerJson(env, `${path.pathname}${path.search}`);
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
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)",
    },
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

async function syncDisclosures(env, payload) {
  const syncedAt = new Date().toISOString();
  const sourceResult = await syncDisclosureSources(env, payload.sources || [], syncedAt);
  const [events, metrics, geometries] = await Promise.all([
    syncDisclosureEvents(env.DB, payload.events || [], syncedAt),
    syncDisclosureMetrics(env.DB, payload.metrics || [], syncedAt),
    syncDisclosureGeometries(env.DB, payload.geometries || [], syncedAt),
  ]);
  return {
    sources: sourceResult.sources,
    source_files_archived: sourceResult.filesArchived,
    source_file_errors: sourceResult.fileErrors,
    events,
    metrics,
    geometries,
    exported_counts: payload.counts || null,
  };
}

async function syncDisclosureSources(env, sources, syncedAt) {
  const statements = sources.map((source) =>
    env.DB.prepare(
      `
      INSERT INTO disclosure_sources
      (source_key, local_id, dai_number, title, source_url, attachment_url, format,
       published_date, transmitted_date, geography_label, geography_type, extraction_method,
       precision_label, notes, sha256, fetched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        local_id = excluded.local_id,
        dai_number = excluded.dai_number,
        title = excluded.title,
        source_url = excluded.source_url,
        attachment_url = excluded.attachment_url,
        format = excluded.format,
        published_date = excluded.published_date,
        transmitted_date = excluded.transmitted_date,
        geography_label = excluded.geography_label,
        geography_type = excluded.geography_type,
        extraction_method = excluded.extraction_method,
        precision_label = excluded.precision_label,
        notes = excluded.notes,
        sha256 = excluded.sha256,
        fetched_at = excluded.fetched_at,
        updated_at = excluded.updated_at
      `,
    ).bind(
      disclosureSourceKey(source),
      source.id,
      source.dai_number,
      source.title,
      source.source_url,
      source.attachment_url,
      source.format,
      source.published_date,
      source.transmitted_date,
      source.geography_label,
      source.geography_type,
      source.extraction_method,
      source.precision_label,
      source.notes,
      source.sha256,
      source.fetched_at,
      source.updated_at || source.fetched_at || syncedAt,
    ),
  );
  await batchInChunks(env.DB, statements);
  const fileResult = await syncDisclosureSourceFiles(env, sources, syncedAt);
  return { sources: sources.length, ...fileResult };
}

async function syncDisclosureSourceFiles(env, sources, syncedAt) {
  if (!env.RAW_BUCKET) return { filesArchived: 0, fileErrors: [] };
  let filesArchived = 0;
  const fileErrors = [];
  for (const source of sources) {
    if (!source.attachment_url || !source.sha256) continue;
    const sourceKey = disclosureSourceKey(source);
    const existing = await env.DB.prepare(
      "SELECT sha256, r2_key FROM disclosure_sources WHERE source_key = ?",
    )
      .bind(sourceKey)
      .first();
    if (existing?.sha256 === source.sha256 && existing?.r2_key) continue;
    try {
      const payload = await fetchContainerDisclosureSource(env, sourceKey);
      const digest = await sha256Hex(payload.bytes);
      const r2Key = disclosureR2Key(source, digest);
      await env.RAW_BUCKET.put(r2Key, payload.bytes, {
        httpMetadata: { contentType: payload.contentType },
        customMetadata: {
          daiNumber: source.dai_number || "",
          sourceKey,
          sha256: digest,
        },
      });
      await env.DB.prepare(
        `
        UPDATE disclosure_sources
        SET r2_key = ?, content_type = ?, sha256 = ?, fetched_at = COALESCE(fetched_at, ?),
            updated_at = ?,
            archival_last_error = NULL,
            archival_deferred_until = NULL
        WHERE source_key = ?
        `,
      )
        .bind(r2Key, payload.contentType, digest, syncedAt, syncedAt, sourceKey)
        .run();
      filesArchived += 1;
    } catch (error) {
      fileErrors.push({ source: source.dai_number, error: String(error?.message || error) });
    }
  }
  return { filesArchived, fileErrors };
}

async function fetchContainerDisclosureSource(env, sourceKey) {
  const container = env.PANNES_CONTAINER.getByName("web");
  const url = new URL("https://pannes.ca/internal/disclosures/source-file");
  url.searchParams.set("source_key", sourceKey);
  const response = await container.fetch(
    new Request(url, {
      headers: {
        Accept: "*/*",
        "X-Cloudflare-Internal": "1",
      },
    }),
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`source file returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return {
    bytes: await response.arrayBuffer(),
    status: response.status,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

async function syncDisclosureEvents(db, events, syncedAt) {
  const statements = events.map((event) => {
    const sourceKey = event.source_key;
    const sourceRowId = String(event.source_row_id || event.id || "");
    return db
      .prepare(
        `
        INSERT INTO disclosure_outage_events
        (id, source_key, source_row_id, start_time, end_time, duration_seconds,
         duration_hours, customers_affected, interruption_type, cause, equipment,
         cause_group, category, geography_label, geography_type, centroid_lon, centroid_lat,
         precision_label, raw_row_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          duration_seconds = excluded.duration_seconds,
          duration_hours = excluded.duration_hours,
          customers_affected = excluded.customers_affected,
          interruption_type = excluded.interruption_type,
          cause = excluded.cause,
          equipment = excluded.equipment,
          cause_group = excluded.cause_group,
          category = excluded.category,
          geography_label = excluded.geography_label,
          geography_type = excluded.geography_type,
          centroid_lon = excluded.centroid_lon,
          centroid_lat = excluded.centroid_lat,
          precision_label = excluded.precision_label,
          raw_row_json = excluded.raw_row_json,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        disclosureRowKey(sourceKey, "event", sourceRowId),
        sourceKey,
        sourceRowId,
        event.start_time,
        event.end_time,
        event.duration_seconds,
        event.duration_hours,
        event.customers_affected,
        event.interruption_type,
        event.cause,
        event.equipment,
        event.cause_group,
        event.category,
        event.geography_label,
        event.geography_type,
        event.centroid_lon,
        event.centroid_lat,
        event.precision_label,
        event.raw_row_json,
        syncedAt,
      );
  });
  await batchInChunks(db, statements);
  return events.length;
}

async function syncDisclosureMetrics(db, metrics, syncedAt) {
  const statements = metrics.map((metric) => {
    const sourceKey = metric.source_key;
    const rowKey = [
      metric.year ?? "",
      metric.period_label ?? "",
      metric.geography_label ?? "",
    ].join("|");
    return db
      .prepare(
        `
        INSERT INTO disclosure_annual_metrics
        (id, source_key, year, period_label, geography_label, geography_type,
         outage_count, average_duration_minutes, continuity_index_minutes,
         long_outage_count, notes, raw_row_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          year = excluded.year,
          period_label = excluded.period_label,
          geography_label = excluded.geography_label,
          geography_type = excluded.geography_type,
          outage_count = excluded.outage_count,
          average_duration_minutes = excluded.average_duration_minutes,
          continuity_index_minutes = excluded.continuity_index_minutes,
          long_outage_count = excluded.long_outage_count,
          notes = excluded.notes,
          raw_row_json = excluded.raw_row_json,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        disclosureRowKey(sourceKey, "metric", rowKey),
        sourceKey,
        metric.year,
        metric.period_label,
        metric.geography_label,
        metric.geography_type,
        metric.outage_count,
        metric.average_duration_minutes,
        metric.continuity_index_minutes,
        metric.long_outage_count,
        metric.notes,
        metric.raw_row_json,
        syncedAt,
      );
  });
  await batchInChunks(db, statements);
  return metrics.length;
}

async function syncDisclosureGeometries(db, geometries, syncedAt) {
  const statements = geometries.map((geometry) => {
    const sourceKey = geometry.source_key;
    const rowKey = [
      geometry.geography_label ?? "",
      geometry.geography_type ?? "",
      geometry.geometry_source ?? "",
    ].join("|");
    return db
      .prepare(
        `
        INSERT INTO disclosure_geometries
        (id, source_key, geography_label, geography_type, geometry_source, centroid_lon,
         centroid_lat, bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          geography_label = excluded.geography_label,
          geography_type = excluded.geography_type,
          geometry_source = excluded.geometry_source,
          centroid_lon = excluded.centroid_lon,
          centroid_lat = excluded.centroid_lat,
          bbox_min_lon = excluded.bbox_min_lon,
          bbox_min_lat = excluded.bbox_min_lat,
          bbox_max_lon = excluded.bbox_max_lon,
          bbox_max_lat = excluded.bbox_max_lat,
          updated_at = excluded.updated_at
        `,
      )
      .bind(
        disclosureRowKey(sourceKey, "geometry", rowKey),
        sourceKey,
        geometry.geography_label,
        geometry.geography_type,
        geometry.geometry_source,
        geometry.centroid_lon,
        geometry.centroid_lat,
        geometry.bbox_min_lon,
        geometry.bbox_min_lat,
        geometry.bbox_max_lon,
        geometry.bbox_max_lat,
        geometry.updated_at || syncedAt,
      );
  });
  await batchInChunks(db, statements);
  return geometries.length;
}

function disclosureSourceKey(source) {
  return source.attachment_url;
}

function disclosureRowKey(sourceKey, kind, rowKey) {
  return `${sourceKey}|${kind}|${rowKey}`;
}

function disclosureR2Key(source, digest) {
  const fileName = source.attachment_url.split("/").pop() || "source";
  return [
    "hydro_quebec/access_disclosures",
    sanitizePathPart(source.dai_number || "unknown"),
    `${digest.slice(0, 16)}-${sanitizePathPart(fileName)}`,
  ].join("/");
}

function sanitizePathPart(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
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
  const disclosures = await disclosureCounts(env.DB);
  return jsonResponse({ versions: versions.results || [], runs: runs.results || [], disclosures });
}

async function disclosureCounts(db) {
  const tables = [
    "disclosure_sources",
    "disclosure_outage_events",
    "disclosure_annual_metrics",
    "disclosure_geometries",
  ];
  const counts = {};
  for (const table of tables) {
    try {
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
      counts[table] = row?.count || 0;
    } catch (_error) {
      counts[table] = null;
    }
  }
  return counts;
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

async function durableHistoryNearbyResponse(request, env) {
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
