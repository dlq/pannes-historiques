from __future__ import annotations

import json
from types import SimpleNamespace

from app.durable_runtime import DurableRuntimeClient


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def settings(**overrides):
    values = {
        "durable_runtime_url": "https://runtime.example/api/durable/runtime",
        "durable_context_cache_ttl_seconds": 120,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_get_forwards_public_read_without_operation_token(monkeypatch):
    requests = []

    def urlopen(request, timeout):
        requests.append((request, timeout))
        return FakeResponse({"ok": True})

    monkeypatch.setattr("app.durable_runtime.urllib.request.urlopen", urlopen)
    client = DurableRuntimeClient(settings())

    assert client.get("map-context", {"scope": "public"}) == {"ok": True}
    request, timeout = requests[0]
    assert (
        request.full_url == "https://runtime.example/api/durable/runtime/map-context?scope=public"
    )
    assert request.get_header("X-pannes-operation-token") is None
    assert timeout == 8


def test_private_reads_and_empty_runtime_url_do_not_make_requests(monkeypatch):
    monkeypatch.setattr(
        "app.durable_runtime.urllib.request.urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected request")),
    )
    client = DurableRuntimeClient(settings())

    assert client.get("status") is None
    assert client.get("geocode-cache") is None

    disabled = DurableRuntimeClient(settings(durable_runtime_url=""))
    assert disabled.get("map-context") is None
