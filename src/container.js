import { Container } from "@cloudflare/containers";

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";

  static outboundByHost = {
    "pannes.ca": async (request, env) => {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/durable/runtime")) return fetch(request);

      url.protocol = "https:";
      const headers = new Headers(request.headers);
      const token = env.PANNES_OPERATION_TOKEN || "";
      if (token) headers.set("X-Pannes-Operation-Token", token);
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
