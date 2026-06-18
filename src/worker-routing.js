export function workerRouteForPath(pathname) {
  if (
    pathname.startsWith("/internal/") ||
    pathname.startsWith("/cron/") ||
    pathname.startsWith("/collect") ||
    pathname.startsWith("/debug/")
  ) {
    return "blocked";
  }
  if (pathname === "/api/durable/hydro") return "durable_hydro";
  if (pathname === "/api/durable/status") return "durable_status";
  if (pathname === "/api/durable/nearby") return "durable_nearby";
  if (pathname === "/api/durable/history-nearby") return "durable_history_nearby";
  if (pathname.startsWith("/api/durable/runtime")) return "durable_runtime";
  return "container";
}
