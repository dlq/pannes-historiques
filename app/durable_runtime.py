from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from .perf import current_timer

PUBLIC_DURABLE_RUNTIME_READS = frozenset({"map-context", "previous-archive-summary"})


class DurableRuntimeClient:
    """HTTP client for public, materialized Worker reads used by Flask."""

    def __init__(self, settings: Any) -> None:
        self.settings = settings

    def get(self, path: str, query: dict[str, str] | None = None) -> dict[str, Any] | None:
        if not self.supports_read(path):
            return None
        suffix = f"/{path.lstrip('/')}"
        encoded = f"?{urllib.parse.urlencode(query)}" if query else ""
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}{suffix}{encoded}",
            headers=self.headers(),
        )
        return self._request_json(request, path)

    def supports_read(self, path: str) -> bool:
        return (
            bool(self.settings.durable_runtime_url)
            and path.strip("/") in PUBLIC_DURABLE_RUNTIME_READS
        )

    @staticmethod
    def headers() -> dict[str, str]:
        return {"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"}

    @staticmethod
    def _request_json(request: urllib.request.Request, path: str) -> dict[str, Any] | None:
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            current_timer().set(f"durable_runtime_{path.replace('/', '_')}_error", str(exc))
            return None
