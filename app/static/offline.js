const lang = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "fr";
document.documentElement.lang = lang;

if (lang === "en") {
  document.title = "pannes.ca offline";
  document.querySelector("#offline-heading").textContent = "Offline for now";
  document.querySelector("#offline-body").textContent =
    "This page is not available without a connection. Reconnect to view current outages, planned interruptions and the archive.";
  document.querySelector("#offline-retry").textContent = "Try again";
}

document.querySelector("#offline-retry").addEventListener("click", () => window.location.reload());
