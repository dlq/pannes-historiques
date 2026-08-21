const FEATURE_ACTIONS = Object.freeze({
  current: new Set(["open", "detail"]),
  planned: new Set(["open", "detail"]),
  archive: new Set(["open", "detail"]),
  context: new Set(["open", "detail"]),
  address: new Set(["answer"]),
  comparison: new Set(["add"]),
});

function privacySignalEnabled() {
  const browser = globalThis.navigator;
  return browser?.globalPrivacyControl === true || browser?.doNotTrack === "1";
}

export async function recordUsage(feature, action) {
  if (!FEATURE_ACTIONS[feature]?.has(action) || privacySignalEnabled()) return false;
  try {
    await fetch("/api/usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pannes-Interaction": "1",
      },
      body: JSON.stringify({ feature, action }),
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
    });
    return true;
  } catch (_error) {
    return false;
  }
}
