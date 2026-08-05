import { Container } from "@cloudflare/containers";

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";

  static outboundByHost = {
    // `env` is not reliably populated for this static outbound hook, so the
    // token it tried to inject was empty and Cloudflare does not stamp
    // `cf-worker` on this internal hop either. Gated runtime endpoints
    // (/map-context, /status) therefore failed both auth paths, which is what
    // left the Contexte tab empty. The container now carries the token itself
    // via DURABLE_RUNTIME_OPERATION_TOKEN in envVars; this hook only forwards.
    "pannes.ca": async (request, env) => {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/durable/runtime")) return fetch(request);

      url.protocol = "https:";
      const headers = new Headers(request.headers);
      const token = env?.PANNES_OPERATION_TOKEN || "";
      // Only set it if the caller did not already supply one.
      if (token && !headers.get("X-Pannes-Operation-Token")) {
        headers.set("X-Pannes-Operation-Token", token);
      }
      return fetch(
        new Request(url.toString(), {
          method: request.method,
          headers,
          body: request.body,
          redirect: request.redirect,
        }),
      );
    },
  };

  get envVars() {
    return {
      APP_HOST: "0.0.0.0",
      APP_PORT: "8080",
      AUTO_REFRESH_ON_SEARCH: "0",
      DURABLE_HISTORY_URL: "https://pannes.ca/api/durable/history-nearby",
      DURABLE_NEARBY_URL: "https://pannes.ca/api/durable/nearby",
      DURABLE_RUNTIME_OPERATION_TOKEN: this.env.PANNES_OPERATION_TOKEN || "",
      DURABLE_RUNTIME_URL: "http://pannes.ca/api/durable/runtime",
      NOMINATIM_USER_AGENT: "pannes-historiques/0.1 (+https://pannes.ca)",
    };
  }

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
