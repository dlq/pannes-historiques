from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from .perf import current_timer


class DurableRuntimeClient:
    """Small HTTP client for the Worker endpoints used by the Flask runtime."""

    def __init__(self, settings: Any) -> None:
        self.settings = settings

    def get(self, path: str, query: dict[str, str] | None = None) -> dict[str, Any] | None:
        if not self.settings.durable_runtime_url:
            return None
        suffix = f"/{path.lstrip('/')}"
        encoded = f"?{urllib.parse.urlencode(query)}" if query else ""
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}{suffix}{encoded}",
            headers=self.headers(),
        )
        return self._request_json(request, path)

    def post(self, path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.settings.durable_runtime_url:
            return None
        request = urllib.request.Request(
            f"{self.settings.durable_runtime_url}/{path.lstrip('/')}",
            data=json.dumps(payload, ensure_ascii=True).encode("utf-8"),
            headers={"Content-Type": "application/json", **self.headers()},
            method="POST",
        )
        return self._request_json(request, path)

    def headers(self) -> dict[str, str]:
        headers = {"User-Agent": "pannes-historiques/0.1 (+https://pannes.ca)"}
        if self.settings.durable_runtime_operation_token:
            headers["X-Pannes-Operation-Token"] = self.settings.durable_runtime_operation_token
        return headers

    @staticmethod
    def _request_json(request: urllib.request.Request, path: str) -> dict[str, Any] | None:
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            current_timer().set(f"durable_runtime_{path.replace('/', '_')}_error", str(exc))
            return None
