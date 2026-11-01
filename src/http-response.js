export function jsonResponse(payload, init = {}) {
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
