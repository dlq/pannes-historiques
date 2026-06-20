const PRIVATE_RUNTIME_ENDPOINTS = new Set([
  "GET /geocode-cache",
  "POST /geocode-cache",
  "POST /address",
  "POST /query",
  "GET /query-count",
  "POST /matches",
  "GET /previous-groups",
  "POST /admin-territories/import",
  "POST /municipal-archive/backfill",
  "GET /municipal-archive/status",
  "GET /operational-map-layers",
  "GET /previous-map-layers",
  "GET /status",
  "GET /map-context",
]);

export function runtimeEndpointRequiresOperationToken(suffix, method) {
  const normalizedSuffix = suffix || "/";
  const normalizedMethod = String(method || "GET").toUpperCase();
  return PRIVATE_RUNTIME_ENDPOINTS.has(`${normalizedMethod} ${normalizedSuffix}`);
}
