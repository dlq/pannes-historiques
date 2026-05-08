from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.addressing import NormalizedAddress
from app.config import Settings
from app.services import SearchResult


def make_search_result() -> SearchResult:
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance",
        normalized_line="5220 rue jeanne-mance, montreal, QC",
        street_line="5220 rue jeanne-mance",
        city="montreal",
        province="QC",
        postal_code="H2V4G7",
        unit="",
    )
    geocode = {
        "latitude": 45.5186,
        "longitude": -73.6027,
        "city": "Montreal",
        "province": "Quebec",
        "postal_code": "H2V 4G7",
    }
    return SearchResult(
        normalized=normalized,
        address_id=1,
        cache_hit=True,
        geocode=geocode,
        matches=[],
        query_count=1,
        collector_summary={},
        coverage={},
        outage_matches=[],
        planned_matches=[],
        previous_outage_groups=[],
        current_map_layers=[],
        disclosure_matches=[],
        disclosure_layers=[],
        disclosure_metrics=[],
        regional_metric_layers=[],
        radius_m=5000,
        error=None,
    )


class StubService:
    last_instance: StubService | None = None

    def __init__(self, settings: Settings):
        self.settings = settings
        self.geocoder = SimpleNamespace(
            suggest=lambda query, language="fr", limit=6: [
                {
                    "label": "5220 Rue Jeanne-Mance, Montreal, Quebec, H2V 4G7",
                    "value": "5220 Rue Jeanne-Mance",
                    "latitude": 45.5186,
                    "longitude": -73.6027,
                    "city": "Montreal",
                    "province": "Quebec",
                    "postal_code": "H2V 4G7",
                }
            ]
        )
        self.search_calls: list[dict[str, object]] = []
        self.search_location_calls: list[dict[str, object]] = []
        StubService.last_instance = self

    def search(self, **kwargs):
        self.search_calls.append(kwargs)
        return make_search_result()

    def search_location(self, **kwargs):
        self.search_location_calls.append(kwargs)
        result = make_search_result()
        result.normalized = NormalizedAddress(  # type: ignore[misc]
            original="Current location",
            normalized_line="current location 45.50000,-73.56000",
            street_line="current location",
            city="montreal",
            province="QC",
            postal_code="",
            unit="",
        )
        return result

    def _regional_metric_map_layers(self):
        return []

    def _disclosure_map_layers(self):
        return []

    def collect(self):
        return {}

    def collect_changed(self):
        return {}

    def collect_current_outages(self):
        return {}

    def collect_planned_interruptions(self):
        return {}

    def collect_disclosures(self):
        return {}

    def run_changed_collection_job(self):
        return {}

    def collect_disclosures_if_due(self):
        return {}

    def collect_disclosure_sources(self, source_keys):
        return {"source_keys": source_keys}

    def collect_disclosure_source_payload(
        self, source_key, payload, *, content_type="application/octet-stream"
    ):
        return {"source_key": source_key, "size": len(payload), "content_type": content_type}

    def disclosure_export(self, source_keys=None):
        return {"source_keys": source_keys or []}

    def disclosure_payload_path(self, source_key):
        return None

    def raw_snapshot_payload_path(self, payload_path):
        return None


@pytest.fixture
def app_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app import web

    monkeypatch.setattr(web, "AppService", StubService)
    settings = Settings(
        base_dir=tmp_path,
        data_dir=tmp_path / "data",
        raw_dir=tmp_path / "data" / "raw",
        db_path=tmp_path / "data" / "app.db",
    )
    app = web.create_app(settings)
    app.config["TESTING"] = True
    app.testing_stub_service = StubService.last_instance  # type: ignore[attr-defined]
    return app.test_client()
