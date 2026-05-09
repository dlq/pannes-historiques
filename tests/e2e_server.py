from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from e2e_fixture_app import E2EStubService

from app import web
from app.config import Settings


def main() -> None:
    web.AppService = E2EStubService
    settings = Settings()
    app = web.create_app(settings)
    app.run(host=settings.host, port=settings.port, debug=False)


if __name__ == "__main__":
    main()
