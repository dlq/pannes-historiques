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
  "GET /municipal-archive/completeness",
  "GET /operational-map-layers",
  "GET /previous-map-layers",
  "GET /status",
  // GET /map-context is deliberately NOT listed. It returns only published
  // access-to-information material from the disclosure_* tables -- the same
  // documents and regional metrics the public site renders -- and touches no
  // runtime_addresses / runtime_geocode_cache / runtime_query_history data.
  // Gating it broke the Contexte tab: the container reaches this Worker
  // without a usable operation token (envVars did not deliver the secret) and
  // without a cf-worker header on the internal hop, so it failed both auth
  // paths and the tab rendered as if no documents existed. Verified against
  // production by logging the gate outcome for the container's own request.
]);

export function runtimeEndpointRequiresOperationToken(suffix, method) {
  const normalizedSuffix = suffix || "/";
  const normalizedMethod = String(method || "GET").toUpperCase();
  return PRIVATE_RUNTIME_ENDPOINTS.has(`${normalizedMethod} ${normalizedSuffix}`);
}

export function isOperationalRequest(request, operationToken) {
  return (
    Boolean(operationToken) && request.headers.get("X-Pannes-Operation-Token") === operationToken
  );
}
