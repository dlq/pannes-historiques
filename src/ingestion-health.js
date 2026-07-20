// Pure ingestion-health decision logic, kept separate from the D1 reads so it
// can be tested directly.
//
// Context: scheduled Hydro ingestion failed every 30 minutes from 2026-07-15 to
// 2026-07-20 while the site kept returning 200s and serving stale outage data.
// Nothing was watching, because the only health surface was token-protected and
// pull-based. These thresholds decide when that situation is an incident.

// The Hydro cron runs every 30 minutes. Three hours tolerates a transient
// upstream outage or a couple of missed runs without crying wolf, while still
// catching a real stall long before it becomes days.
export const INGESTION_STALE_AFTER_MINUTES = 180;

// One failed run is noise -- upstream hiccups happen. A sustained streak is a
// stall that will not fix itself.
export const INGESTION_FAILURE_STREAK_ALERT = 3;

export function countConsecutiveFailures(recentStatuses) {
  let failures = 0;
  for (const status of recentStatuses || []) {
    if (status === "ok") break;
    if (status === "error") failures += 1;
  }
  return failures;
}

export function evaluateIngestionHealth({
  newestSnapshot = null,
  lastSuccessfulRun = null,
  recentStatuses = [],
  now = undefined,
  staleAfterMinutes = INGESTION_STALE_AFTER_MINUTES,
  failureStreakAlert = INGESTION_FAILURE_STREAK_ALERT,
} = {}) {
  const nowMs = now === undefined ? Date.now() : now;
  const parsed = newestSnapshot ? Date.parse(newestSnapshot) : Number.NaN;
  const ageMinutes = Number.isNaN(parsed)
    ? null
    : Math.max(0, Math.round((nowMs - parsed) / 60000));

  const consecutiveFailures = countConsecutiveFailures(recentStatuses);
  const stale = ageMinutes === null || ageMinutes > staleAfterMinutes;
  const failing = consecutiveFailures >= failureStreakAlert;

  const problems = [];
  if (stale) {
    problems.push(
      ageMinutes === null
        ? "no retained Hydro snapshot"
        : `newest Hydro snapshot is ${ageMinutes} minutes old`,
    );
  }
  if (failing) problems.push(`${consecutiveFailures} consecutive failed ingestion runs`);

  return {
    healthy: !stale && !failing,
    newest_snapshot: newestSnapshot,
    snapshot_age_minutes: ageMinutes,
    last_successful_run: lastSuccessfulRun,
    consecutive_failures: consecutiveFailures,
    stale_after_minutes: staleAfterMinutes,
    problems,
  };
}
