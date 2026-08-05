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
  "GET /map-context",
]);

export function runtimeEndpointRequiresOperationToken(suffix, method) {
  const normalizedSuffix = suffix || "/";
  const normalizedMethod = String(method || "GET").toUpperCase();
  return PRIVATE_RUNTIME_ENDPOINTS.has(`${normalizedMethod} ${normalizedSuffix}`);
}

export function isTrustedContainerRuntimeProxyRequest(request, trustedWorkerHost) {
  const url = new URL(request.url);
  // Deliberately protocol-agnostic. The container's outbound handler rewrites
  // its own http: request to https: before it reaches this gate, so requiring
  // one protocol here silently rejects the very requests this is meant to
  // trust. Identity still rests on the cf-worker, host and user-agent checks
  // below, which a public client cannot forge.
  return (
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
