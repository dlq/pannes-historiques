import { Container } from "@cloudflare/containers";

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";
  envVars = {
    APP_HOST: "0.0.0.0",
    APP_PORT: "8080",
    AUTO_REFRESH_ON_SEARCH: "0",
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
    const started = Date.now();
    const url = new URL(request.url);
    const container = env.PANNES_CONTAINER.getByName("web");
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
  },
};
