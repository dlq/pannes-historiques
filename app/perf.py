from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import time
from collections.abc import Iterator
from typing import Any

LOGGER = logging.getLogger("pannes.perf")
MAX_STEP_HEADER_ITEMS = 6
_CURRENT_TIMER: contextvars.ContextVar[RequestTimer | None] = contextvars.ContextVar(
    "pannes_request_timer",
    default=None,
)


class NullTimer:
    @contextlib.contextmanager
    def step(self, _name: str) -> Iterator[None]:
        yield

    def add(self, _name: str, _elapsed_ms: float) -> None:
        return None

    def set(self, _key: str, _value: Any) -> None:
        return None

    def snapshot(self) -> dict[str, Any]:
        return {}

    def slowest_steps(self, *, limit: int = MAX_STEP_HEADER_ITEMS) -> list[tuple[str, float]]:
        return []


class RequestTimer:
    def __init__(self, *, request_id: str, route: str, method: str, path: str) -> None:
        self.request_id = request_id
        self.route = route
        self.method = method
        self.path = path
        self.started = time.perf_counter()
        self.steps: dict[str, float] = {}
        self.attrs: dict[str, Any] = {}

    @contextlib.contextmanager
    def step(self, name: str) -> Iterator[None]:
        started = time.perf_counter()
        try:
            yield
        finally:
            self.add(name, (time.perf_counter() - started) * 1000)

    def add(self, name: str, elapsed_ms: float) -> None:
        self.steps[name] = round(self.steps.get(name, 0.0) + elapsed_ms, 2)

    def set(self, key: str, value: Any) -> None:
        self.attrs[key] = value

    def snapshot(self) -> dict[str, Any]:
        total_ms = round((time.perf_counter() - self.started) * 1000, 2)
        return {
            "request_id": self.request_id,
            "route": self.route,
            "method": self.method,
            "path": self.path,
            "total_ms": total_ms,
            "steps": dict(sorted(self.steps.items())),
            "attrs": self.attrs,
        }

    def slowest_steps(self, *, limit: int = MAX_STEP_HEADER_ITEMS) -> list[tuple[str, float]]:
        return sorted(self.steps.items(), key=lambda item: item[1], reverse=True)[:limit]

    def log(self, *, status_code: int | None = None, error: str | None = None) -> None:
        payload = self.snapshot()
        payload["event"] = "request_timing"
        if status_code is not None:
            payload["status_code"] = status_code
        if error:
            payload["error"] = error
        LOGGER.info(json.dumps(payload, sort_keys=True, ensure_ascii=True))


def current_timer() -> RequestTimer | NullTimer:
    return _CURRENT_TIMER.get() or NullTimer()


def set_current_timer(timer: RequestTimer):
    return _CURRENT_TIMER.set(timer)


def reset_current_timer(token) -> None:
    _CURRENT_TIMER.reset(token)
