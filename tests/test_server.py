from __future__ import annotations

import sys

import server
from app.config import Settings


def test_serve_command_never_enables_flask_debugger(monkeypatch, tmp_path):
    calls: list[dict[str, object]] = []

    class App:
        def run(self, **kwargs):
            calls.append(kwargs)

    settings = Settings(
        base_dir=tmp_path,
        data_dir=tmp_path / "data",
        raw_dir=tmp_path / "data" / "raw",
        db_path=tmp_path / "data" / "app.db",
    )
    monkeypatch.setattr(server, "Settings", lambda: settings)
    monkeypatch.setattr(server, "create_app", lambda _: App())
    monkeypatch.setattr(sys, "argv", ["server.py", "serve"])

    server.main()

    assert calls == [{"host": settings.host, "port": settings.port, "debug": False}]
