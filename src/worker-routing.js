export function workerRouteForPath(pathname) {
  const normalizedPath = pathname.toLowerCase();
  if (
    normalizedPath.startsWith("/internal/") ||
    normalizedPath.startsWith("/cron/") ||
    normalizedPath.startsWith("/collect") ||
    normalizedPath.startsWith("/debug/") ||
    isObviousScannerPath(normalizedPath)
  ) {
    return "blocked";
  }
  if (pathname === "/api/durable/hydro") return "durable_hydro";
  if (pathname === "/api/durable/status") return "durable_status";
  if (pathname === "/api/durable/nearby") return "durable_nearby";
  if (pathname === "/api/durable/history-nearby") return "durable_history_nearby";
  if (pathname === "/api/ops/cost-health") return "cost_health";
  // Deliberately unauthenticated: an uptime monitor must be able to poll it
  // without a secret. It exposes only data-freshness facts already visible on
  // the public site, and returns 503 when ingestion goes stale so any external
  // monitor raises an alert without extra infrastructure.
  if (pathname === "/api/health/ingestion") return "ingestion_health";
  if (pathname.startsWith("/api/durable/runtime")) return "durable_runtime";
  return "container";
}

function isObviousScannerPath(pathname) {
  return (
    pathname.endsWith(".php") ||
    pathname === "/.env" ||
    pathname.startsWith("/.env.") ||
    pathname === "/.git" ||
    pathname.startsWith("/.git/") ||
    pathname.startsWith("/wp-") ||
    pathname.startsWith("/wordpress/") ||
    pathname.startsWith("/phpmyadmin") ||
    pathname.startsWith("/cgi-bin/") ||
    pathname.startsWith("/vendor/phpunit/") ||
    pathname.startsWith("/administrator/") ||
    pathname.startsWith("/libraries/joomla/")
  );
}
