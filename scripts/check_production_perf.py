from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

DEFAULT_ENDPOINTS = [
    ("/", "home"),
    ("/sheet?domain=overview&q=5220%20Rue%20Jeanne-Mance&lang=en", "sheet_overview"),
    ("/api/durable/status", "durable_status"),
    ("/api/durable/runtime/operational-map-layers?include_planned=1", "runtime_operational"),
    ("/api/durable/runtime/previous-map-layers?limit=48", "runtime_previous"),
    ("/static/app.js", "app_js"),
]


@dataclass
class TimingResult:
    label: str
    url: str
    ok: bool
    status: int | None
    total_ms: float
    bytes: int
    server_timing: str
    container_fetch_ms: str
    error: str = ""


def fetch_timing(url: str, label: str, timeout: float) -> TimingResult:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "pannes-historiques-perf-check/0.2 (+https://pannes.ca)"},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            elapsed_ms = (time.perf_counter() - started) * 1000
            return TimingResult(
                label=label,
                url=url,
                ok=200 <= response.status < 400,
                status=response.status,
                total_ms=round(elapsed_ms, 2),
                bytes=len(body),
                server_timing=response.headers.get("server-timing", ""),
                container_fetch_ms=response.headers.get("x-pannes-worker-container-fetch-ms", ""),
            )
    except urllib.error.HTTPError as error:
        elapsed_ms = (time.perf_counter() - started) * 1000
        body = error.read()
        return TimingResult(
            label=label,
            url=url,
            ok=False,
            status=error.code,
            total_ms=round(elapsed_ms, 2),
            bytes=len(body),
            server_timing=error.headers.get("server-timing", ""),
            container_fetch_ms=error.headers.get("x-pannes-worker-container-fetch-ms", ""),
            error=str(error),
        )
    except Exception as error:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return TimingResult(
            label=label,
            url=url,
            ok=False,
            status=None,
            total_ms=round(elapsed_ms, 2),
            bytes=0,
            server_timing="",
            container_fetch_ms="",
            error=str(error),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Check production pannes.ca response timings.")
    parser.add_argument("--base-url", default="https://pannes.ca")
    parser.add_argument("--repeat", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text rows.")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    results = []
    for run in range(1, args.repeat + 1):
        for path, label in DEFAULT_ENDPOINTS:
            result = fetch_timing(f"{base_url}{path}", f"{label}_{run}", args.timeout)
            results.append(result)

    if args.json:
        print(json.dumps([asdict(result) for result in results], indent=2))
        return

    for result in results:
        status = result.status if result.status is not None else "ERR"
        print(
            f"{result.label:22} status={status} total_ms={result.total_ms:8.2f} "
            f"bytes={result.bytes:8} app={result.server_timing or '-'} "
            f"container_ms={result.container_fetch_ms or '-'}"
        )
        if result.error:
            print(f"{'':22} error={result.error}")


if __name__ == "__main__":
    main()
