import { Container } from "@cloudflare/containers";

export class PannesContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  pingEndpoint = "pannes/healthz";
  envVars = {
    APP_HOST: "0.0.0.0",
    APP_PORT: "8080",
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
    const container = env.PANNES_CONTAINER.getByName("web");
    return container.fetch(request);
  },
};
