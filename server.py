from __future__ import annotations

import argparse
import json
from wsgiref.simple_server import make_server

from app.config import Settings
from app.web import create_app
from app.web import serialize_payload
from app.services import AppService


def main() -> None:
    parser = argparse.ArgumentParser(description="Pannes Historiques app")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("serve", help="Run the web app")
    subparsers.add_parser("collect", help="Fetch and ingest Hydro-Quebec snapshots")
    args = parser.parse_args()

    settings = Settings()

    if args.command == "collect":
        service = AppService(settings)
        result = service.collect()
        print(json.dumps(serialize_payload(result), indent=2, ensure_ascii=True))
        return

    app = create_app(settings)
    with make_server(settings.host, settings.port, app) as server:
        print(f"Serving on http://{settings.host}:{settings.port}")
        server.serve_forever()


if __name__ == "__main__":
    main()
