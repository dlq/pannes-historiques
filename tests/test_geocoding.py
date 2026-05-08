from types import SimpleNamespace

from app.addressing import NormalizedAddress
from app.geocoding import GeocodingService, haversine_meters


def test_suggest_aggregates_candidates_and_uses_cache(monkeypatch):
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    calls: list[str] = []

    def fake_search(query: str, *, language: str, limit: int):
        calls.append(query)
        if query == "5220 rue jeanne":
            return [
                {
                    "lat": "45.5",
                    "lon": "-73.6",
                    "display_name": "5220 Rue Jeanne, Montreal, Quebec, Canada",
                    "address": {
                        "house_number": "5220",
                        "road": "Rue Jeanne",
                        "city": "Montreal",
                        "state": "Quebec",
                    },
                }
            ]
        if query == "5220 rue jeanne, Montreal, Quebec, Canada":
            return [
                {
                    "lat": "45.5186",
                    "lon": "-73.6027",
                    "display_name": "5220 Rue Jeanne-Mance, Montreal, Quebec, H2V 4G7, Canada",
                    "address": {
                        "house_number": "5220",
                        "road": "Rue Jeanne-Mance",
                        "city": "Montreal",
                        "state": "Quebec",
                        "postcode": "H2V 4G7",
                    },
                }
            ]
        return []

    monkeypatch.setattr(service, "_nominatim_search", fake_search)

    results = service.suggest("5220 rue jeanne", language="fr", limit=5)

    assert calls == [
        "5220 rue jeanne",
        "5220 rue jeanne, Montreal, Quebec, Canada",
        "5220 rue jeanne, Quebec, Canada",
    ]
    assert any(item["value"] == "5220 Rue Jeanne-Mance" for item in results)

    cached_results = service.suggest("5220 rue jeanne", language="fr", limit=5)

    assert cached_results == results
    assert len(calls) == 3


def test_candidate_queries_include_original_canonical_and_postal_variants():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance, Montréal, QC, H2V 4G7",
        normalized_line="5220 rue jeanne-mance, montreal, QC, H2V4G7",
        street_line="5220 rue jeanne-mance",
        city="montreal",
        province="QC",
        postal_code="H2V4G7",
        unit="",
    )

    assert service._candidate_queries(normalized) == [
        "5220 Rue Jeanne-Mance, Montréal, QC, H2V 4G7, Quebec, Canada",
        "5220 rue jeanne-mance, montreal, Quebec, Canada",
        "5220 rue jeanne-mance, H2V4G7, Quebec, Canada",
    ]


def test_autocomplete_queries_add_quebec_context_only_when_missing():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)

    assert service._autocomplete_queries("5220 rue jeanne") == [
        "5220 rue jeanne",
        "5220 rue jeanne, Montreal, Quebec, Canada",
        "5220 rue jeanne, Quebec, Canada",
    ]
    assert service._autocomplete_queries("5220 rue jeanne, Montreal") == [
        "5220 rue jeanne, Montreal",
        "5220 rue jeanne, Montreal, Canada",
    ]


def test_fallback_city_returns_jittered_known_city_centroid():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    normalized = NormalizedAddress(
        original="1 Avenue Davaar, Outremont, QC",
        normalized_line="1 avenue davaar, outremont, QC",
        street_line="1 avenue davaar",
        city="outremont",
        province="QC",
        postal_code="",
        unit="",
    )

    result = service._fallback_city(normalized)

    assert result is not None
    assert result.provider == "fallback_city_centroid"
    assert result.city == "Outremont"
    assert result.quality == "municipality"


def test_haversine_meters_is_zero_for_identical_points():
    assert haversine_meters(45.5, -73.6, 45.5, -73.6) == 0
