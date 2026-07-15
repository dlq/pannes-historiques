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

export function isTrustedContainerRuntimeProxyRequest(request, trustedWorkerHost) {
  const url = new URL(request.url);
  return (
    url.protocol === "http:" &&
    url.pathname.startsWith("/api/durable/runtime") &&
    Boolean(trustedWorkerHost) &&
    request.headers.get("cf-worker") === trustedWorkerHost &&
    request.headers.get("host") === "pannes.ca" &&
    request.headers.get("user-agent") === "pannes-historiques/0.1 (+https://pannes.ca)"
  );
}

export function isOperationalRequest(request, operationToken, trustedWorkerHost) {
  return (
    (Boolean(operationToken) &&
      request.headers.get("X-Pannes-Operation-Token") === operationToken) ||
    isTrustedContainerRuntimeProxyRequest(request, trustedWorkerHost)
  );
}
