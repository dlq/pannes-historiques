from pathlib import Path
from types import SimpleNamespace

from app.web import serialize_payload


def test_serialize_payload_handles_paths_and_objects():
    payload = {
        "path": Path("/tmp/example.txt"),
        "items": [SimpleNamespace(name="alpha"), {"nested": SimpleNamespace(value=3)}],
    }

    assert serialize_payload(payload) == {
        "path": "/tmp/example.txt",
        "items": [{"name": "alpha"}, {"nested": {"value": 3}}],
    }


def test_serialize_payload_does_not_expose_exception_details():
    assert serialize_payload(RuntimeError("sensitive detail")) == {"error": "internal error"}
