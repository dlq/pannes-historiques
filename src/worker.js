import { Container } from "@cloudflare/containers";
import { unzipSync } from "fflate";

const DISCLOSURE_CRONS = new Set(["0 10 */14 * *", "13 10 */14 * *"]);
const DISCLOSURE_BATCH_SIZE = 1;
const DISCLOSURE_RUN_BUDGET_MS = 90_000;
const DISCLOSURE_FETCH_TIMEOUT_MS = 45_000;
const DISCLOSURE_PARSE_TIMEOUT_MS = 60_000;
const DISCLOSURE_SOURCE_DEFER_MS = 24 * 60 * 60 * 1000;
const CONTAINER_INSTANCE_NAME = "web";

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
    DURABLE_RUNTIME_URL: "https://pannes.ca/api/durable/runtime",
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
    if (url.hostname === "www.pannes.ca") {
      url.hostname = "pannes.ca";
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname.startsWith("/internal/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/cron/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/collect")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/debug/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api/durable/hydro") {
      return durableHydroResponse(env);
    }
    if (url.pathname === "/api/durable/status") {
      if (!isOperationalRequest(request, env)) {
        return new Response("Not found", { status: 404 });
      }
      return durableStatusResponse(env);
    }
    if (url.pathname === "/api/durable/nearby") {
      return durableNearbyResponse(request, env);
    }
    if (url.pathname === "/api/durable/history-nearby") {
      return durableHistoryNearbyResponse(request, env);
    }
    if (url.pathname.startsWith("/api/durable/runtime")) {
      return durableRuntimeResponse(request, env);
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

function isOperationalRequest(request, env) {
  const token = env.PANNES_OPERATION_TOKEN;
  return Boolean(token) && request.headers.get("X-Pannes-Operation-Token") === token;
}

async function fetchContainer(request, env) {
  const started = Date.now();
  const url = new URL(request.url);
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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
    const versions = await currentFeedVersionMap(env.DB);
    summary.container = {
      status: 200,
      body: await callContainerJsonPost(
        env,
        "/cron/hydro/durable-fetch",
        { versions },
        { timeoutMs: 90_000 },
      ),
    };
    summary.d1 = await syncHydroFromContainerResult(env, summary.container);
  } catch (error) {
    summary.errors.push({ step: "container_hydro_sync", error: String(error?.stack || error) });
  }
  const status = summary.errors.length ? "error" : "ok";
  await recordRunFinished(env.DB, run.meta.last_row_id, status, summary);
  if (summary.errors.length) console.error("Hydro schedule completed with errors", summary);
}

async function currentFeedVersionMap(db) {
  const rows = await db.prepare("SELECT source, version FROM feed_versions").all();
  return Object.fromEntries((rows.results || []).map((row) => [row.source, row.version]));
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
  const polySnapshot = relevantSnapshots.find(
    (snapshot) => snapshot.source_type === `${source}poly`,
  );
  if (!markerSnapshot) {
    throw new Error(`container hydro summary did not include ${source} marker snapshot`);
  }

  let markerPayload = null;
  let polyPayload = null;
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
    if (snapshot.source_type === `${source}poly`) polyPayload = payload;
  }

  if (!markerPayload) throw new Error(`container hydro did not provide ${source} marker payload`);
  if (!polySnapshot || !polyPayload)
    throw new Error(`container hydro summary did not include ${source} polygon payload`);
  const count =
    source === "bis"
      ? await ingestBisMarkers(env.DB, version, decodeUtf8(markerPayload.bytes), checkedAt)
      : await ingestAipMarkers(env.DB, version, decodeUtf8(markerPayload.bytes), checkedAt);
  const polygonCount = await ingestHydroPolygons(
    env.DB,
    `${source}poly`,
    version,
    polyPayload.bytes,
    checkedAt,
  );
  await upsertFeedVersion(env.DB, source, version, checkedAt);
  return { source, version, changed: true, records: count, polygons: polygonCount };
}

async function fetchContainerRawSnapshot(env, snapshot) {
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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

async function callContainerBytesPost(
  env,
  path,
  payload,
  { sourceKey, contentType, timeoutMs } = {},
) {
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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
          "Content-Type": contentType || "application/octet-stream",
          "X-Cloudflare-Scheduled": "1",
          "X-Disclosure-Source-Key": sourceKey || "",
        },
        body: payload,
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
  const summary = {
    archives: [],
    parses: [],
    total_sources: 0,
    total_events: 0,
    total_errors: 0,
  };
  try {
    const deadline = Date.now() + budgetMs;
    const attemptedArchives = new Set();
    const attemptedParses = new Set();
    while (Date.now() < deadline && summary.archives.length + summary.parses.length < maxBatches) {
      let didWork = false;
      const archiveSources = (await dueDisclosureArchiveSources(env.DB, 100)).filter(
        (source) => !attemptedArchives.has(source.source_key),
      );
      archiveSources.splice(batchSize);
      for (const source of archiveSources) {
        attemptedArchives.add(source.source_key);
        await markDisclosureSourceAttempt(env.DB, [source.source_key]);
        try {
          const archived = await archiveDisclosureSource(env, source);
          summary.archives.push(archived);
        } catch (error) {
          const errorText = String(error?.stack || error);
          await markDisclosureSourceError(env.DB, [source.source_key], errorText);
          summary.archives.push({
            source_key: source.source_key,
            dai_number: source.dai_number,
            error: errorText,
          });
          summary.total_errors += 1;
        }
        didWork = true;
        if (Date.now() >= deadline) break;
      }

      if (Date.now() >= deadline) break;

      const parseSources = (await dueDisclosureParseSources(env.DB, 100)).filter(
        (source) => !attemptedParses.has(source.source_key),
      );
      parseSources.splice(batchSize);
      for (const source of parseSources) {
        attemptedParses.add(source.source_key);
        await markDisclosureParseAttempt(env.DB, [source.source_key]);
        try {
          const parsed = await parseDisclosureSource(env, source);
          summary.parses.push(parsed);
          summary.total_sources += parsed.d1.sources;
          summary.total_events += parsed.d1.events;
          summary.total_errors += parsed.d1.source_file_errors.length;
        } catch (error) {
          const errorText = String(error?.stack || error);
          await markDisclosureParseError(env.DB, [source.source_key], errorText);
          summary.parses.push({
            source_key: source.source_key,
            dai_number: source.dai_number,
            error: errorText,
          });
          summary.total_errors += 1;
        }
        didWork = true;
        if (Date.now() >= deadline) break;
      }

      if (!didWork) {
        summary.done = true;
        break;
      }
    }
    if (!summary.done) {
      const [remainingArchives, remainingParses] = await Promise.all([
        dueDisclosureArchiveSources(env.DB, 1),
        dueDisclosureParseSources(env.DB, 1),
      ]);
      summary.remaining =
        remainingArchives.length || remainingParses.length
          ? {
              archives: remainingArchives.length ? "yes" : "no",
              parses: remainingParses.length ? "yes" : "no",
            }
          : "no";
    }
    await recordRunFinished(env.DB, run.meta.last_row_id, "ok", summary);
    return summary;
  } catch (error) {
    summary.error = String(error?.stack || error);
    await recordRunFinished(env.DB, run.meta.last_row_id, "error", summary);
    throw error;
  }
}

async function dueDisclosureArchiveSources(db, limit) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `
      SELECT source_key, dai_number, attachment_url, format
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
  return result.results || [];
}

async function dueDisclosureParseSources(db, limit) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `
      SELECT source_key, dai_number, attachment_url, format, r2_key, content_type, sha256, fetched_at
      FROM disclosure_sources
      WHERE r2_key IS NOT NULL
        AND (parsed_at IS NULL OR (fetched_at IS NOT NULL AND parsed_at < fetched_at))
        AND (parse_deferred_until IS NULL OR parse_deferred_until <= ?)
      ORDER BY parse_attempt_count, COALESCE(parsed_at, ''), dai_number
      LIMIT ?
      `,
    )
    .bind(now, limit)
    .all();
  return result.results || [];
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

async function markDisclosureParseAttempt(db, sourceKeys) {
  const attemptedAt = new Date().toISOString();
  const statements = sourceKeys.map((sourceKey) =>
    db
      .prepare(
        `
        UPDATE disclosure_sources
        SET parse_attempt_count = COALESCE(parse_attempt_count, 0) + 1,
            parse_last_attempt_at = ?,
            parse_deferred_until = NULL
        WHERE source_key = ?
        `,
      )
      .bind(attemptedAt, sourceKey),
  );
  await batchInChunks(db, statements);
}

async function markDisclosureParseError(db, sourceKeys, errorText) {
  const attemptedAt = new Date().toISOString();
  const deferredUntil = new Date(Date.now() + DISCLOSURE_SOURCE_DEFER_MS).toISOString();
  const statements = sourceKeys.map((sourceKey) =>
    db
      .prepare(
        `
        UPDATE disclosure_sources
        SET parse_last_attempt_at = ?,
            parse_last_error = ?,
            parse_deferred_until = ?
        WHERE source_key = ?
        `,
      )
      .bind(attemptedAt, errorText.slice(0, 1000), deferredUntil, sourceKey),
  );
  await batchInChunks(db, statements);
}

async function markDisclosureParsed(db, sourceKey) {
  const parsedAt = new Date().toISOString();
  await db
    .prepare(
      `
      UPDATE disclosure_sources
      SET parsed_at = ?,
          parse_last_error = NULL,
          parse_deferred_until = NULL,
          updated_at = ?
      WHERE source_key = ?
      `,
    )
    .bind(parsedAt, parsedAt, sourceKey)
    .run();
}

async function archiveDisclosureSource(env, source) {
  if (!env.RAW_BUCKET) throw new Error("RAW_BUCKET binding is not configured");
  const fetchedAt = new Date().toISOString();
  const payload = await fetchArrayBuffer(source.attachment_url, {
    accept: source.format === "pdf" ? "application/pdf,*/*" : "*/*",
    timeoutMs: DISCLOSURE_FETCH_TIMEOUT_MS,
  });
  const digest = await sha256Hex(payload.bytes);
  const r2Key = disclosureR2Key(source, digest);
  await env.RAW_BUCKET.put(r2Key, payload.bytes, {
    httpMetadata: { contentType: payload.contentType },
    customMetadata: {
      daiNumber: source.dai_number || "",
      sourceKey: source.source_key,
      sha256: digest,
    },
  });
  await env.DB.prepare(
    `
    UPDATE disclosure_sources
    SET r2_key = ?,
        content_type = ?,
        sha256 = ?,
        fetched_at = ?,
        updated_at = ?,
        archival_last_error = NULL,
        archival_deferred_until = NULL,
        parsed_at = CASE WHEN sha256 = ? THEN parsed_at ELSE NULL END
    WHERE source_key = ?
    `,
  )
    .bind(r2Key, payload.contentType, digest, fetchedAt, fetchedAt, digest, source.source_key)
    .run();
  return {
    source_key: source.source_key,
    dai_number: source.dai_number,
    r2_key: r2Key,
    sha256: digest,
    bytes: payload.bytes.byteLength,
  };
}

async function parseDisclosureSource(env, source) {
  if (!env.RAW_BUCKET) throw new Error("RAW_BUCKET binding is not configured");
  const object = await env.RAW_BUCKET.get(source.r2_key);
  if (!object) throw new Error(`R2 object not found: ${source.r2_key}`);
  const bytes = await object.arrayBuffer();
  const container = await callContainerBytesPost(env, "/cron/disclosures/parse-source", bytes, {
    sourceKey: source.source_key,
    contentType:
      source.content_type || object.httpMetadata?.contentType || "application/octet-stream",
    timeoutMs: DISCLOSURE_PARSE_TIMEOUT_MS,
  });
  if ((container.errors || []).length) {
    throw new Error(JSON.stringify(container.errors));
  }
  const exportPayload = await callContainerDisclosureExport(env, [source.source_key]);
  const d1 = await syncDisclosures(env, exportPayload);
  await markDisclosureParsed(env.DB, source.source_key);
  return {
    source_key: source.source_key,
    dai_number: source.dai_number,
    container,
    d1,
  };
}

async function callContainerDisclosureExport(env, sourceKeys) {
  const path = new URL("https://pannes.ca/internal/disclosures/export");
  for (const sourceKey of sourceKeys) path.searchParams.append("source_key", sourceKey);
  return callContainerJson(env, `${path.pathname}${path.search}`);
}

async function fetchArrayBuffer(
  url,
  { accept = "application/json,text/plain,*/*", timeoutMs = null } = {},
) {
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(`timed out after ${timeoutMs}ms`), timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)",
      },
      signal: controller?.signal,
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
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function decodeUtf8(buffer) {
  return new TextDecoder().decode(buffer);
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
  const container = env.PANNES_CONTAINER.getByName(CONTAINER_INSTANCE_NAME);
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

async function ingestHydroPolygons(db, sourceType, version, kmzBuffer, updatedAt) {
  const features = parseKmzPolygons(kmzBuffer);
  const statements = features.map((feature, index) => {
    const polygonId = feature.polygon_id || String(index);
    return db
      .prepare(
        `
        INSERT OR REPLACE INTO hydro_polygon_geometries
        (id, source_type, source_version, polygon_id, name, centroid_lon, centroid_lat,
         bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, geometry_geojson,
         raw_coordinates, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        `${sourceType}:${version}:${polygonId}`,
        sourceType,
        version,
        polygonId,
        feature.name,
        feature.centroid_lon,
        feature.centroid_lat,
        feature.bbox[0],
        feature.bbox[1],
        feature.bbox[2],
        feature.bbox[3],
        JSON.stringify(feature.geometry),
        feature.raw_coordinates,
        updatedAt,
      );
  });
  await batchInChunks(db, statements);
  return features.length;
}

function parseKmzPolygons(kmzBuffer) {
  const files = unzipSync(new Uint8Array(kmzBuffer));
  const kmlName = Object.keys(files).find((name) => name.endsWith(".kml"));
  if (!kmlName) return [];
  return parseKmlPolygons(new TextDecoder().decode(files[kmlName]));
}

function parseKmlPolygons(kmlText) {
  const features = [];
  for (const placemark of kmlText.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)) {
    const placemarkText = placemark[0];
    const polygonMatch = placemarkText.match(/<Polygon\b[\s\S]*?<\/Polygon>/);
    if (!polygonMatch) continue;
    const coordinates = extractTagText(polygonMatch[0], "coordinates").trim();
    if (!coordinates) continue;
    const points = [];
    for (const chunk of coordinates.split(/\s+/)) {
      const [rawLon, rawLat] = chunk.split(",");
      const lon = Number.parseFloat(rawLon);
      const lat = Number.parseFloat(rawLat);
      if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat]);
    }
    if (points.length < 3) continue;
    const lons = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    const name = extractTagText(placemarkText, "name");
    features.push({
      polygon_id: name,
      name,
      centroid_lon: lons.reduce((sum, lon) => sum + lon, 0) / lons.length,
      centroid_lat: lats.reduce((sum, lat) => sum + lat, 0) / lats.length,
      bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      geometry: { type: "Polygon", coordinates: [points] },
      raw_coordinates: coordinates,
    });
  }
  return features;
}

function extractTagText(text, tagName) {
  const match = text.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
  if (!match) return "";
  return decodeXmlEntities(
    match[1]
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .trim(),
  );
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
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

async function durableRuntimeResponse(request, env) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace("/api/durable/runtime", "") || "/";
  if (suffix === "/geocode-cache") return runtimeGeocodeCacheResponse(request, env, url);
  if (suffix === "/address" && request.method === "POST")
    return runtimeAddressResponse(request, env);
  if (suffix === "/query" && request.method === "POST") return runtimeQueryResponse(request, env);
  if (suffix === "/query-count" && request.method === "GET")
    return runtimeQueryCountResponse(env, url);
  if (suffix === "/matches" && request.method === "POST")
    return runtimeMatchesResponse(request, env);
  if (suffix === "/previous-groups" && request.method === "GET")
    return runtimePreviousGroupsResponse(env, url);
  if (suffix === "/previous-archive-summary" && request.method === "GET")
    return runtimePreviousArchiveSummaryResponse(env);
  if (suffix === "/operational-map-layers" && request.method === "GET")
    return runtimeOperationalMapLayersResponse(env, url);
  if (suffix === "/previous-map-layers" && request.method === "GET")
    return runtimePreviousMapLayersResponse(env, url);
  if (suffix === "/status" && request.method === "GET") return runtimeStatusResponse(env);
  if (suffix === "/map-context" && request.method === "GET") return runtimeMapContextResponse(env);
  return jsonResponse({ error: "runtime endpoint not found" }, { status: 404 });
}

async function runtimeGeocodeCacheResponse(request, env, url) {
  if (request.method === "GET") {
    const normalizedQuery = url.searchParams.get("normalized_query") || "";
    if (!normalizedQuery) return jsonResponse({ item: null });
    const row = await env.DB.prepare(
      `
      SELECT provider, confidence, quality, latitude, longitude, city, province, postal_code, raw_json
      FROM runtime_geocode_cache
      WHERE normalized_query = ?
      `,
    )
      .bind(normalizedQuery)
      .first();
    return jsonResponse({ item: row || null });
  }
  if (request.method !== "POST")
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  const payload = await request.json();
  const item = payload.item || payload;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `
    INSERT INTO runtime_geocode_cache
    (normalized_query, provider, confidence, quality, latitude, longitude, city, province,
     postal_code, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_query) DO UPDATE SET
      provider = excluded.provider,
      confidence = excluded.confidence,
      quality = excluded.quality,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      city = excluded.city,
      province = excluded.province,
      postal_code = excluded.postal_code,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
    `,
  )
    .bind(
      item.normalized_query,
      item.provider,
      item.confidence,
      item.quality,
      item.latitude,
      item.longitude,
      item.city || "",
      item.province || "",
      item.postal_code || "",
      JSON.stringify(item.raw_json || {}),
      now,
    )
    .run();
  return jsonResponse({ ok: true });
}

async function runtimeAddressResponse(request, env) {
  const payload = await request.json();
  const normalized = payload.normalized || {};
  const geocode = payload.geocode || {};
  const existing = await env.DB.prepare(
    "SELECT id FROM runtime_addresses WHERE normalized_line = ?",
  )
    .bind(normalized.normalized_line)
    .first();
  if (existing) {
    await env.DB.prepare(
      `
      UPDATE runtime_addresses
      SET updated_at = CURRENT_TIMESTAMP,
          latitude = ?,
          longitude = ?,
          geocoder = ?,
          geocoder_confidence = ?,
          geocode_quality = ?
      WHERE id = ?
      `,
    )
      .bind(
        geocode.latitude,
        geocode.longitude,
        geocode.provider,
        geocode.confidence,
        geocode.quality,
        existing.id,
      )
      .run();
    return jsonResponse({ address_id: existing.id, cache_hit: true });
  }
  const result = await env.DB.prepare(
    `
    INSERT INTO runtime_addresses
    (original_query, normalized_line, street_line, unit, city, province, postal_code,
     latitude, longitude, geocoder, geocoder_confidence, geocode_quality)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      normalized.original || "",
      normalized.normalized_line,
      normalized.street_line || "",
      normalized.unit || "",
      geocode.city || normalized.city || "",
      normalized.province || "",
      geocode.postal_code || normalized.postal_code || "",
      geocode.latitude,
      geocode.longitude,
      geocode.provider,
      geocode.confidence,
      geocode.quality,
    )
    .run();
  return jsonResponse({ address_id: result.meta.last_row_id, cache_hit: false });
}

async function runtimeQueryResponse(request, env) {
  const payload = await request.json();
  await env.DB.prepare(
    `
    INSERT INTO runtime_query_history
    (address_id, original_query, normalized_query, language, radius_m, time_window_days,
     include_planned, cache_hit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      payload.address_id,
      payload.original_query || "",
      payload.normalized_query || "",
      payload.language || "fr",
      payload.radius_m,
      payload.days,
      payload.include_planned ? 1 : 0,
      payload.cache_hit ? 1 : 0,
    )
    .run();
  return runtimeQueryCountResponse(env, null, payload.address_id);
}

async function runtimeQueryCountResponse(env, url, addressId = null) {
  const resolvedAddressId = addressId ?? Number(url.searchParams.get("address_id"));
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM runtime_query_history WHERE address_id = ?",
  )
    .bind(resolvedAddressId)
    .first();
  return jsonResponse({ count: row?.count || 0 });
}

async function runtimeMatchesResponse(request, env) {
  const payload = await request.json();
  const addressId = payload.address_id;
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const statements = matches
    .filter((item) => item.outage_kind === "outage" && item.event_key)
    .map((item) =>
      env.DB.prepare(
        `
        INSERT INTO runtime_address_outage_matches
        (address_id, outage_kind, record_id, event_key, geometry_id, match_type, distance_m,
         confidence, event_json, matched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(address_id, outage_kind, event_key) DO UPDATE SET
          record_id = excluded.record_id,
          geometry_id = excluded.geometry_id,
          match_type = excluded.match_type,
          distance_m = excluded.distance_m,
          confidence = excluded.confidence,
          event_json = excluded.event_json,
          matched_at = excluded.matched_at
        `,
      ).bind(
        addressId,
        item.outage_kind,
        String(item.record_id ?? ""),
        item.event_key,
        item.geometry_id === null || item.geometry_id === undefined
          ? null
          : String(item.geometry_id),
        item.match_type,
        item.distance_m,
        item.confidence,
        JSON.stringify(item),
      ),
    );
  await batchInChunks(env.DB, statements);
  return jsonResponse({ ok: true, count: statements.length });
}

async function runtimePreviousGroupsResponse(env, url) {
  const addressId = Number(url.searchParams.get("address_id"));
  const result = await env.DB.prepare(
    `
    SELECT event_json, matched_at
    FROM runtime_address_outage_matches
    WHERE address_id = ?
      AND outage_kind = 'outage'
    ORDER BY matched_at DESC
    LIMIT 250
    `,
  )
    .bind(addressId)
    .all();
  const groups = new Map();
  for (const row of result.results || []) {
    const item = JSON.parse(row.event_json);
    const key =
      item.geometry_id !== null && item.geometry_id !== undefined
        ? `geometry:${item.geometry_id}`
        : `centroid:${Number(item.centroid_lat || 0).toFixed(3)}:${Number(item.centroid_lon || 0).toFixed(3)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        geometry_id: item.geometry_id,
        label: item.municipality_code || `${item.centroid_lat}, ${item.centroid_lon}`,
        municipality_code: item.municipality_code,
        centroid_lat: item.centroid_lat,
        centroid_lon: item.centroid_lon,
        geometry_geojson: item.geometry_geojson || null,
        events: [],
      });
    }
    groups.get(key).events.push({ ...item, matched_at: row.matched_at });
  }
  const items = [...groups.values()].map((group) => {
    group.events.sort((left, right) =>
      String(right.sort_time || right.start_time || "").localeCompare(
        String(left.sort_time || left.start_time || ""),
      ),
    );
    group.event_count = group.events.length;
    group.latest_start_time = group.events[0]?.start_time || null;
    return group;
  });
  items.sort((left, right) =>
    String(right.latest_start_time || "").localeCompare(String(left.latest_start_time || "")),
  );
  return jsonResponse({ groups: items });
}

async function runtimeOperationalMapLayersResponse(env, url) {
  const includePlanned = url.searchParams.get("include_planned") !== "0";
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const versionMap = new Map((versions.results || []).map((row) => [row.source, row.version]));
  const [outageRows, plannedRows, outageGeometries, plannedGeometries] = await Promise.all([
    latestRows(env.DB, "bis", "current_outage_records"),
    includePlanned ? latestRows(env.DB, "aip", "current_planned_interruptions") : [],
    hydroGeometryRows(env.DB, "bispoly", [versionMap.get("bis")]),
    includePlanned ? hydroGeometryRows(env.DB, "aippoly", [versionMap.get("aip")]) : [],
  ]);
  const layers = [
    ...operationalMapLayers(outageRows, outageGeometries, "outage"),
    ...operationalMapLayers(plannedRows, plannedGeometries, "planned"),
  ];
  return jsonResponse({ layers });
}

async function runtimePreviousMapLayersResponse(env, url) {
  const limit = Math.trunc(clamp(numberParam(url, "limit") ?? 120, 1, 250));
  const currentRows = await latestRows(env.DB, "bis", "current_outage_records");
  const currentKeys = new Set(
    currentRows.map((row) =>
      eventKey(
        "outage",
        row.municipality_code,
        row.centroid_lat,
        row.centroid_lon,
        row.interruption_type,
        row.outage_start_time,
      ),
    ),
  );
  const result = await env.DB.prepare(
    `
    SELECT *
    FROM resolved_events
    WHERE outage_kind = 'outage'
      AND centroid_lat IS NOT NULL
      AND centroid_lon IS NOT NULL
    ORDER BY COALESCE(start_time, last_seen_at, updated_at) DESC
    LIMIT ?
    `,
  )
    .bind(limit * 12)
    .all();
  const rows = (result.results || []).filter((row) => !currentKeys.has(row.event_key));
  const versions = [
    ...new Set(
      rows.flatMap((row) =>
        String(row.source_versions || "")
          .split(",")
          .map((version) => version.trim())
          .filter(Boolean),
      ),
    ),
  ];
  const geometries = await hydroGeometryRows(env.DB, "bispoly", versions);
  const layers = operationalMapLayers(rows, geometries, "previous_outage").slice(0, limit);
  return jsonResponse({ layers });
}

async function runtimePreviousArchiveSummaryResponse(env) {
  const currentRows = await latestRows(env.DB, "bis", "current_outage_records");
  const currentKeys = new Set(
    currentRows.map((row) =>
      eventKey(
        "outage",
        row.municipality_code,
        row.centroid_lat,
        row.centroid_lon,
        row.interruption_type,
        row.outage_start_time,
      ),
    ),
  );
  const cutoff24h = sqlTimestampHoursAgo(24);
  const cutoff7d = sqlTimestampDaysAgo(7);
  const cutoff30d = sqlTimestampDaysAgo(30);
  const cutoff1y = sqlTimestampDaysAgo(365);
  const result = await env.DB.prepare(
    `
    SELECT *,
           COALESCE(start_time, last_seen_at, updated_at) AS sort_time
    FROM resolved_events
    WHERE outage_kind = 'outage'
      AND centroid_lat IS NOT NULL
      AND centroid_lon IS NOT NULL
      AND COALESCE(start_time, last_seen_at, updated_at, '') >= ?
    ORDER BY sort_time DESC
    `,
  )
    .bind(cutoff1y)
    .all();
  const items = (result.results || [])
    .filter((row) => !currentKeys.has(row.event_key))
    .map(previousArchiveItem);
  return jsonResponse({
    windows: [
      previousArchiveWindow(items, "previous_archive_last_24h", cutoff24h),
      previousArchiveWindow(items, "previous_archive_last_7d", cutoff7d),
      previousArchiveWindow(items, "previous_archive_last_30d", cutoff30d),
      previousArchiveWindow(items, "previous_archive_last_1y", cutoff1y),
    ],
    largest: previousArchiveLargest(items),
    latest: items.slice(0, 20).map((item) => ({
      key: "previous_archive_latest",
      startTime: item.startTime,
      customersAffected: item.customersAffected,
    })),
  });
}

function previousArchiveItem(row) {
  return {
    startTime: row.sort_time || row.start_time || row.last_seen_at || row.updated_at || "",
    customersAffected: Number(row.customers_max || 0),
  };
}

function previousArchiveWindow(items, key, cutoff) {
  const windowItems = items.filter((item) => item.startTime >= cutoff);
  return {
    key,
    areas: windowItems.length,
    totalCustomers: windowItems.reduce((total, item) => total + item.customersAffected, 0),
  };
}

function previousArchiveLargest(items) {
  let largest = null;
  for (const item of items) {
    if (!largest || item.customersAffected > largest.customersAffected) largest = item;
  }
  if (!largest) return null;
  return {
    key: "previous_archive_largest",
    startTime: largest.startTime,
    customersAffected: largest.customersAffected,
  };
}

function sqlTimestampHoursAgo(hours) {
  return sqlTimestamp(new Date(Date.now() - hours * 60 * 60 * 1000));
}

function sqlTimestampDaysAgo(days) {
  return sqlTimestamp(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function sqlTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function hydroGeometryRows(db, sourceType, versions) {
  const uniqueVersions = [...new Set((versions || []).filter(Boolean))];
  if (!uniqueVersions.length) return [];
  const rows = [];
  for (let index = 0; index < uniqueVersions.length; index += 80) {
    const versionChunk = uniqueVersions.slice(index, index + 80);
    const placeholders = versionChunk.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `
        SELECT *
        FROM hydro_polygon_geometries
        WHERE source_type = ?
          AND source_version IN (${placeholders})
        `,
      )
      .bind(sourceType, ...versionChunk)
      .all();
    rows.push(...(result.results || []));
  }
  return rows;
}

function operationalMapLayers(rows, geometryRows, outageKind) {
  const groups = new Map();
  const geometriesByVersion = new Map();
  for (const geometry of geometryRows || []) {
    const parsed = { ...geometry, geometry_geojson: JSON.parse(geometry.geometry_geojson) };
    if (!geometriesByVersion.has(parsed.source_version)) {
      geometriesByVersion.set(parsed.source_version, []);
    }
    geometriesByVersion.get(parsed.source_version).push(parsed);
  }

  for (const row of rows || []) {
    if (!Number.isFinite(row.centroid_lat) || !Number.isFinite(row.centroid_lon)) continue;
    const geometry = assignedHydroGeometry(row, geometriesByVersion);
    const geometryId = geometry?.id || null;
    const stableGeometryKey = geometry
      ? [
          row.municipality_code || "",
          Number.isFinite(geometry.centroid_lat) ? geometry.centroid_lat.toFixed(2) : "",
          Number.isFinite(geometry.centroid_lon) ? geometry.centroid_lon.toFixed(2) : "",
        ].join(":")
      : null;
    const key = `${outageKind}:${
      outageKind === "previous_outage"
        ? stableGeometryKey || row.event_key || row.id
        : geometryId || row.id || row.event_key
    }`;
    const isOutage = outageKind === "outage" || outageKind === "previous_outage";
    const startTime =
      (isOutage ? row.outage_start_time || row.start_time : row.scheduled_start) || null;
    const endTime =
      (isOutage ? row.estimated_restore_time || row.end_time : row.scheduled_end) || null;
    const customersAffected = isOutage
      ? (row.customers_affected ?? row.customers_max ?? row.customers_min)
      : row.customers_affected;
    const event = {
      start_time: startTime,
      end_time: endTime,
      customers_affected: customersAffected,
      status: row.status,
      municipality_code: row.municipality_code,
      centroid_lat: row.centroid_lat,
      centroid_lon: row.centroid_lon,
      distance_m: null,
      sighting_count: row.record_count || 1,
    };
    const groupEventKey =
      row.event_key ||
      eventKey(
        isOutage ? "outage" : outageKind,
        row.municipality_code,
        row.centroid_lat,
        row.centroid_lon,
        isOutage ? row.interruption_type : "AIP",
        startTime,
      );
    if (!groups.has(key)) {
      groups.set(key, {
        outage_kind: outageKind,
        record_id: row.id || row.event_key,
        geometry_id: geometryId,
        geometry_geojson: geometry?.geometry_geojson || null,
        match_type: outageKind === "previous_outage" ? "previous_context_map" : "current_feed_map",
        distance_m: null,
        confidence: 0.5,
        municipality_code: row.municipality_code,
        customers_affected: customersAffected,
        status: row.status,
        interruption_type: isOutage ? row.interruption_type : "AIP",
        start_time: startTime,
        end_time: endTime,
        centroid_lat: row.centroid_lat,
        centroid_lon: row.centroid_lon,
        sort_time: startTime || row.last_seen_at || row.updated_at || null,
        event_count: outageKind === "previous_outage" ? 1 : row.record_count || 1,
        recent_events: [event],
        _eventKeys: outageKind === "previous_outage" ? new Set([groupEventKey]) : new Set(),
      });
    } else {
      const group = groups.get(key);
      if (outageKind === "previous_outage" && group._eventKeys.has(groupEventKey)) {
        continue;
      }
      if (outageKind === "previous_outage") group._eventKeys.add(groupEventKey);
      group.event_count += outageKind === "previous_outage" ? 1 : row.record_count || 1;
      group.recent_events.push(event);
      if (outageKind === "planned" || outageKind === "previous_outage") {
        group.customers_affected = Math.max(group.customers_affected || 0, customersAffected || 0);
      } else {
        group.customers_affected = (group.customers_affected || 0) + (customersAffected || 0);
      }
      if (String(startTime || "") > String(group.start_time || "")) {
        group.start_time = startTime;
        group.end_time = endTime;
        group.status = row.status;
        group.sort_time = startTime || row.last_seen_at || row.updated_at || null;
      }
    }
  }
  return [...groups.values()]
    .map((group) => {
      group._eventKeys = undefined;
      return group;
    })
    .sort((left, right) =>
      String(right.sort_time || "").localeCompare(String(left.sort_time || "")),
    );
}

function assignedHydroGeometry(row, geometriesByVersion) {
  const versions = [
    row.source_version,
    ...String(row.source_versions || "")
      .split(",")
      .map((version) => version.trim())
      .filter(Boolean),
  ].filter(Boolean);
  const candidates = versions.flatMap((version) => geometriesByVersion.get(version) || []);
  if (!candidates.length) return null;
  return candidates.reduce((best, candidate) => {
    const bestDistance = distanceMeters(
      row.centroid_lat,
      row.centroid_lon,
      best.centroid_lat,
      best.centroid_lon,
    );
    const candidateDistance = distanceMeters(
      row.centroid_lat,
      row.centroid_lon,
      candidate.centroid_lat,
      candidate.centroid_lon,
    );
    return candidateDistance < bestDistance ? candidate : best;
  }, candidates[0]);
}

async function runtimeStatusResponse(env) {
  const versions = await env.DB.prepare("SELECT * FROM feed_versions").all();
  const snapshots = await env.DB.prepare("SELECT COUNT(*) AS count FROM hydro_snapshots").first();
  const latest = await env.DB.prepare(
    "SELECT source_type, source_version, fetched_at FROM hydro_snapshots ORDER BY fetched_at DESC LIMIT 1",
  ).first();
  const earliest = await env.DB.prepare(
    "SELECT source_type, source_version, fetched_at FROM hydro_snapshots ORDER BY fetched_at ASC LIMIT 1",
  ).first();
  const coverage = await durableCoverage(env.DB);
  return jsonResponse({
    collector: {
      snapshot_count: snapshots?.count || 0,
      latest: latest || null,
      earliest: earliest || null,
    },
    coverage,
    versions: versions.results || [],
  });
}

async function durableCoverage(db) {
  const outage = await db.prepare("SELECT COUNT(*) AS count FROM current_outage_records").first();
  const planned = await db
    .prepare("SELECT COUNT(*) AS count FROM current_planned_interruptions")
    .first();
  const events = await db.prepare("SELECT COUNT(*) AS count FROM resolved_events").first();
  const geometries = await db
    .prepare("SELECT COUNT(*) AS count FROM hydro_polygon_geometries")
    .first();
  const sources = await db.prepare("SELECT COUNT(*) AS count FROM disclosure_sources").first();
  const disclosureEvents = await db
    .prepare("SELECT COUNT(*) AS count FROM disclosure_outage_events")
    .first();
  const metrics = await db
    .prepare("SELECT COUNT(*) AS count FROM disclosure_annual_metrics")
    .first();
  const outageRange = await db
    .prepare(
      "SELECT MIN(outage_start_time) AS min_time, MAX(outage_start_time) AS max_time FROM current_outage_records",
    )
    .first();
  const plannedRange = await db
    .prepare(
      "SELECT MIN(scheduled_start) AS min_time, MAX(scheduled_start) AS max_time FROM current_planned_interruptions",
    )
    .first();
  return {
    outage_count: outage?.count || 0,
    planned_count: planned?.count || 0,
    event_count: events?.count || 0,
    geometry_count: geometries?.count || 0,
    outage_min_time: outageRange?.min_time || null,
    outage_max_time: outageRange?.max_time || null,
    planned_min_time: plannedRange?.min_time || null,
    planned_max_time: plannedRange?.max_time || null,
    disclosure_source_count: sources?.count || 0,
    disclosure_event_count: disclosureEvents?.count || 0,
    disclosure_metric_count: metrics?.count || 0,
  };
}

async function runtimeMapContextResponse(env) {
  const [regional, disclosure] = await Promise.all([
    runtimeRegionalMetricLayers(env.DB),
    runtimeDisclosureLayers(env.DB),
  ]);
  return jsonResponse({ regional_metric_layers: regional, disclosure_layers: disclosure });
}

async function runtimeRegionalMetricLayers(db) {
  const rows = await db
    .prepare(
      `
      SELECT m.*, s.dai_number, s.title, s.attachment_url, g.centroid_lon, g.centroid_lat
      FROM disclosure_annual_metrics m
      JOIN disclosure_sources s ON s.source_key = m.source_key
      LEFT JOIN disclosure_geometries g
        ON g.source_key = s.source_key
       AND g.geography_label = m.geography_label
      WHERE m.geography_type = 'administrative_region'
      ORDER BY m.geography_label, COALESCE(m.year, 0) DESC, s.dai_number DESC
      `,
    )
    .all();
  const groups = new Map();
  for (const item of rows.results || []) {
    const key = item.geography_label;
    if (!groups.has(key)) {
      groups.set(key, {
        outage_kind: "regional_metric",
        source_dai: item.dai_number,
        source_title: item.title,
        source_url: item.attachment_url,
        source_dais: [],
        geography_label: item.geography_label,
        geography_type: item.geography_type,
        year: item.year,
        period_label: item.period_label,
        outage_count: item.outage_count,
        average_duration_minutes: item.average_duration_minutes,
        continuity_index_minutes: item.continuity_index_minutes,
        long_outage_count: item.long_outage_count,
        centroid_lon: item.centroid_lon,
        centroid_lat: item.centroid_lat,
        geometry_geojson: null,
        metrics: [],
      });
    }
    const group = groups.get(key);
    if (!group.source_dais.includes(item.dai_number)) group.source_dais.push(item.dai_number);
    group.metrics.push({
      source_dai: item.dai_number,
      source_title: item.title,
      source_url: item.attachment_url,
      year: item.year,
      period_label: item.period_label,
      outage_count: item.outage_count,
      average_duration_minutes: item.average_duration_minutes,
      continuity_index_minutes: item.continuity_index_minutes,
      long_outage_count: item.long_outage_count,
    });
  }
  return [...groups.values()].sort((left, right) =>
    String(left.geography_label).localeCompare(String(right.geography_label)),
  );
}

async function runtimeDisclosureLayers(db) {
  const rows = await db
    .prepare(
      `
      SELECT e.id, e.start_time, e.end_time, e.duration_seconds, e.customers_affected,
             e.cause, e.equipment, e.geography_label, e.geography_type, e.precision_label,
             s.dai_number, s.title, s.attachment_url, g.centroid_lon, g.centroid_lat
      FROM disclosure_outage_events e
      JOIN disclosure_sources s ON s.source_key = e.source_key
      LEFT JOIN disclosure_geometries g
        ON g.source_key = s.source_key
       AND g.geography_label = e.geography_label
      ORDER BY COALESCE(e.start_time, e.updated_at) DESC
      `,
    )
    .all();
  const groups = new Map();
  for (const item of rows.results || []) {
    const key = `${item.geography_type}:${item.geography_label}`;
    if (!groups.has(key)) {
      groups.set(key, {
        outage_kind: "disclosure",
        source_dai: item.dai_number,
        source_title: item.title,
        source_url: item.attachment_url,
        source_dais: [],
        source_titles: {},
        municipality_code: item.geography_label,
        geography_type: item.geography_type,
        precision_label: item.precision_label,
        centroid_lon: item.centroid_lon,
        centroid_lat: item.centroid_lat,
        geometry_geojson: null,
        record_count: 0,
        start_min: null,
        start_max: null,
        duration_seconds_total: 0,
        cause_counts: {},
        recent_events: [],
      });
    }
    const group = groups.get(key);
    if (!group.source_dais.includes(item.dai_number)) {
      group.source_dais.push(item.dai_number);
      group.source_titles[item.dai_number] = item.title;
    }
    group.record_count += 1;
    if (item.start_time) {
      group.start_min = group.start_min
        ? String(group.start_min) < item.start_time
          ? group.start_min
          : item.start_time
        : item.start_time;
      group.start_max = group.start_max
        ? String(group.start_max) > item.start_time
          ? group.start_max
          : item.start_time
        : item.start_time;
    }
    if (item.duration_seconds !== null) group.duration_seconds_total += item.duration_seconds;
    const cause = item.cause || "Unknown";
    group.cause_counts[cause] = (group.cause_counts[cause] || 0) + 1;
    if (group.recent_events.length < 12) {
      group.recent_events.push({
        start_time: item.start_time,
        end_time: item.end_time,
        duration_seconds: item.duration_seconds,
        cause: item.cause,
        row_area: item.equipment,
        customers_affected: item.customers_affected,
        source_dai: item.dai_number,
      });
    }
  }
  return [...groups.values()]
    .map((group) => {
      const topCauses = Object.entries(group.cause_counts)
        .sort(
          (left, right) => right[1] - left[1] || String(right[0]).localeCompare(String(left[0])),
        )
        .slice(0, 4)
        .map(([cause, count]) => ({ cause, count }));
      const { cause_counts: _causeCounts, ...publicGroup } = group;
      return { ...publicGroup, top_causes: topCauses };
    })
    .sort((left, right) =>
      `${left.source_dai}:${left.municipality_code}`.localeCompare(
        `${right.source_dai}:${right.municipality_code}`,
      ),
    );
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
