const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const FEATURE_ACTIONS = Object.freeze({
  current: new Set(["open", "detail"]),
  planned: new Set(["open", "detail"]),
  archive: new Set(["open", "detail"]),
  context: new Set(["open", "detail"]),
  address: new Set(["answer"]),
  comparison: new Set(["add"]),
});

const OBVIOUS_NON_HUMAN_USER_AGENT =
  /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|monitor|uptime|preview|facebookexternalhit|twitterbot|linkedinbot|discordbot/i;

export function normalizeUsageEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const feature = typeof value.feature === "string" ? value.feature : "";
  const action = typeof value.action === "string" ? value.action : "";
  if (!FEATURE_ACTIONS[feature]?.has(action)) return null;
  return { feature, action };
}

export function classifyUsageRequest(request) {
  if (request.headers.get("X-Pannes-Interaction") !== "1") return "non_human";
  const fetchSite = (request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return "non_human";
  const userAgent = request.headers.get("User-Agent") || "";
  if (!userAgent || OBVIOUS_NON_HUMAN_USER_AGENT.test(userAgent)) return "non_human";
  return "human";
}

export function usageRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export async function incrementDailyUsage(db, event, classification, now = new Date()) {
  const usageDate = now.toISOString().slice(0, 10);
  const updatedAt = now.toISOString();
  const humanIncrement = classification === "human" ? 1 : 0;
  const nonHumanIncrement = classification === "human" ? 0 : 1;
  await markUsageCollectionDay(db, now);
  return db
    .prepare(
      `
      INSERT INTO usage_daily_aggregates (
        usage_date,
        feature,
        action,
        human_interaction_count,
        non_human_count,
        collection_status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT (usage_date, feature, action) DO UPDATE SET
        human_interaction_count = human_interaction_count + excluded.human_interaction_count,
        non_human_count = non_human_count + excluded.non_human_count,
        collection_status = 'active',
        updated_at = excluded.updated_at
      `,
    )
    .bind(usageDate, event.feature, event.action, humanIncrement, nonHumanIncrement, updatedAt)
    .run();
}

export async function cleanupUsageEvidence(db, now = new Date()) {
  const retainedAfter = usageRetentionCutoff(now);
  await markUsageCollectionDay(db, now);
  const aggregateRows = await db
    .prepare("DELETE FROM usage_daily_aggregates WHERE usage_date < ?")
    .bind(retainedAfter)
    .run();
  const collectionDays = await db
    .prepare("DELETE FROM usage_collection_days WHERE usage_date < ?")
    .bind(retainedAfter)
    .run();
  return {
    aggregate_rows_deleted: aggregateRows.meta?.changes || 0,
    collection_days_deleted: collectionDays.meta?.changes || 0,
    retention_days: RETENTION_DAYS,
    retained_after: retainedAfter,
  };
}

export async function readUsageEvidence(db, now = new Date()) {
  const retainedAfter = usageRetentionCutoff(now);
  const [result, collectionResult] = await Promise.all([
    db
      .prepare(
        `
      SELECT
        usage_date,
        feature,
        action,
        human_interaction_count,
        non_human_count,
        collection_status,
        updated_at
      FROM usage_daily_aggregates
      WHERE usage_date >= ?
      ORDER BY usage_date DESC, feature, action
      `,
      )
      .bind(retainedAfter)
      .all(),
    db
      .prepare(
        `
      SELECT usage_date, collection_status, updated_at
      FROM usage_collection_days
      WHERE usage_date >= ?
      ORDER BY usage_date DESC
      `,
      )
      .bind(retainedAfter)
      .all(),
  ]);
  const rows = result.results || [];
  const collectionDays = collectionResult.results || [];
  const totals = rows.reduce(
    (summary, row) => ({
      human_interactions: summary.human_interactions + Number(row.human_interaction_count || 0),
      non_human: summary.non_human + Number(row.non_human_count || 0),
    }),
    { human_interactions: 0, non_human: 0 },
  );
  const today = now.toISOString().slice(0, 10);
  const latestCollectionDay = collectionDays[0] || null;
  const collectionStatus =
    latestCollectionDay?.usage_date === today
      ? latestCollectionDay.collection_status
      : collectionDays.length
        ? "stale"
        : "no_data";
  return {
    generated_at: now.toISOString(),
    retention: { days: RETENTION_DAYS, retained_after: retainedAfter },
    collection_status: collectionStatus,
    collection_coverage: {
      observed_days: collectionDays.length,
      newest_day: latestCollectionDay?.usage_date || null,
      oldest_day: collectionDays.at(-1)?.usage_date || null,
    },
    metric_definitions: {
      human_interactions: "Allowlisted in-app actions with a human interaction signal.",
      non_human: "Events from obvious automation or without a human interaction signal.",
      audience: "Counts are interactions, never people or unique visitors.",
    },
    totals,
    rows,
  };
}

async function markUsageCollectionDay(db, now) {
  const usageDate = now.toISOString().slice(0, 10);
  const updatedAt = now.toISOString();
  return db
    .prepare(
      `
      INSERT INTO usage_collection_days (usage_date, collection_status, updated_at)
      VALUES (?, 'active', ?)
      ON CONFLICT (usage_date) DO UPDATE SET
        collection_status = 'active',
        updated_at = excluded.updated_at
      `,
    )
    .bind(usageDate, updatedAt)
    .run();
}

export async function usageCollectionResponse(request, db, now = new Date()) {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 512) {
    return new Response(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  let event;
  try {
    const body = await request.text();
    if (body.length > 512) {
      return new Response(null, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    event = normalizeUsageEvent(JSON.parse(body));
  } catch (_error) {
    event = null;
  }
  if (!event) return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    await incrementDailyUsage(db, event, classifyUsageRequest(request), now);
  } catch (error) {
    console.error("Usage-evidence increment failed", error);
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "X-Pannes-Runtime": "worker-d1" },
  });
}

export async function usageEvidenceResponse(db, { authorized, now = new Date() } = {}) {
  if (!authorized) return new Response("Not found", { status: 404 });
  try {
    return usageJsonResponse(await readUsageEvidence(db, now));
  } catch (error) {
    console.error("Usage-evidence readout failed", error);
    return usageJsonResponse({ error: "usage evidence unavailable" }, { status: 503 });
  }
}

function usageJsonResponse(payload, init = {}) {
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
