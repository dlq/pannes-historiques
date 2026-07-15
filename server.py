from __future__ import annotations

import argparse
import json

from app.config import Settings
from app.services import AppService
from app.web import create_app, serialize_payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Pannes Historiques app")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("serve", help="Run the web app")
    subparsers.add_parser("collect", help="Fetch and ingest Hydro-Quebec snapshots")
    subparsers.add_parser("collect-bis", help="Fetch and ingest current outage snapshots")
    subparsers.add_parser(
        "collect-aip",
        help="Fetch and ingest planned interruption snapshots",
    )
    subparsers.add_parser(
        "collect-disclosures",
        help="Fetch and ingest published access-to-information outage disclosures",
    )
    args = parser.parse_args()

    settings = Settings()

    if args.command == "collect":
        service = AppService(settings)
        result = service.collect()
        print(json.dumps(serialize_payload(result), indent=2, ensure_ascii=True))
        return

    if args.command == "collect-bis":
        service = AppService(settings)
        result = service.collect_current_outages()
        print(json.dumps(serialize_payload(result), indent=2, ensure_ascii=True))
        return

    if args.command == "collect-aip":
        service = AppService(settings)
        result = service.collect_planned_interruptions()
        print(json.dumps(serialize_payload(result), indent=2, ensure_ascii=True))
        return

    if args.command == "collect-disclosures":
        service = AppService(settings)
        result = service.collect_disclosures()
        print(json.dumps(serialize_payload(result), indent=2, ensure_ascii=True))
        return

    app = create_app(settings)
    app.run(host=settings.host, port=settings.port, debug=False)


if __name__ == "__main__":
    main()
