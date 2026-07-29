import io
import json
from contextlib import nullcontext
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


def test_autocomplete_queries_expand_quebec_direction_and_street_abbreviations():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)

    assert service._autocomplete_queries("1010 rue Sherbrooke O.") == [
        "1010 rue Sherbrooke O.",
        "1010 rue sherbrooke ouest",
        "1010 rue Sherbrooke O., Montreal, Quebec, Canada",
        "1010 rue sherbrooke ouest, Montreal, Quebec, Canada",
        "1010 rue Sherbrooke O., Quebec, Canada",
        "1010 rue sherbrooke ouest, Quebec, Canada",
    ]


def test_default_city_context_is_added_for_street_only_civic_queries():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance",
        normalized_line="5220 rue jeanne-mance, QC",
        street_line="5220 rue jeanne-mance",
        city="",
        province="QC",
        postal_code="",
        unit="",
    )

    contextual = service._default_city_context(normalized)

    assert contextual is not None
    assert contextual.original == "5220 Rue Jeanne-Mance, Montreal, QC"
    assert contextual.normalized_line == "5220 rue jeanne-mance, montreal, QUEBEC"
    assert contextual.city == "montreal"


def test_geocode_uses_default_city_context_when_street_only_lookup_misses(monkeypatch):
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
        durable_runtime_url="",
    )
    service = GeocodingService(settings)
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance",
        normalized_line="5220 rue jeanne-mance, QC",
        street_line="5220 rue jeanne-mance",
        city="",
        province="QC",
        postal_code="",
        unit="",
    )
    stored: list[str] = []

    monkeypatch.setattr(service, "_from_cache", lambda _query: None)
    monkeypatch.setattr(service, "_nominatim", lambda _normalized: None)
    monkeypatch.setattr(service, "_store_cache", lambda query, _result: stored.append(query))

    result = service.geocode(normalized)

    assert result is not None
    assert result.provider == "fallback_city_centroid"
    assert result.city == "Montreal"
    assert stored == [
        "5220 rue jeanne-mance, QC",
        "5220 rue jeanne-mance, montreal, QUEBEC",
    ]


def test_suggestion_score_prefers_complete_civic_address_matches():
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    candidate_queries = service._autocomplete_queries("1010 rue Sherbrooke O.")

    exact = {
        "value": "1010 Rue Sherbrooke Ouest",
        "label": "1010 Rue Sherbrooke Ouest, Montreal, Quebec, H3A 1G5",
        "display_name": "1010 Rue Sherbrooke Ouest, Montreal, Quebec, H3A 1G5, Canada",
        "postal_code": "H3A 1G5",
        "_type": "house",
        "_class": "building",
        "_importance": 0.72,
    }
    weak = {
        "value": "Rue Sherbrooke Ouest",
        "label": "Rue Sherbrooke Ouest, Montreal, Quebec",
        "display_name": "Rue Sherbrooke Ouest, Montreal, Quebec, Canada",
        "postal_code": "",
        "_type": "road",
        "_class": "highway",
        "_importance": 0.84,
    }

    assert service._suggestion_score(
        "1010 rue Sherbrooke O.", exact, candidate_queries
    ) > service._suggestion_score("1010 rue Sherbrooke O.", weak, candidate_queries)


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


def test_durable_cache_round_trip_and_network_failures_are_non_fatal(monkeypatch):
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        durable_runtime_url="https://worker.invalid/runtime",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    row = {
        "provider": "durable",
        "confidence": 0.9,
        "quality": "address",
        "latitude": 45.5,
        "longitude": -73.6,
        "city": "Montreal",
        "province": "Quebec",
        "postal_code": "H2V 4G7",
        "raw_json": json.dumps({"source": "cache"}),
    }
    requests = []

    def fake_urlopen(request, timeout):
        requests.append((request, timeout))
        return nullcontext(io.BytesIO(json.dumps({"item": row}).encode("utf-8")))

    monkeypatch.setattr("app.geocoding.urllib.request.urlopen", fake_urlopen)

    cached = service._from_durable_cache("5220 rue jeanne-mance")
    assert cached is not None
    assert cached.provider == "durable"

    service._store_durable_cache("5220 rue jeanne-mance", cached)
    assert requests[0][0].full_url.endswith("normalized_query=5220+%5B%5D") is False
    assert requests[1][0].method == "POST"

    monkeypatch.setattr(
        "app.geocoding.urllib.request.urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError()),
    )
    assert service._from_durable_cache("missing") is None
    service._store_durable_cache("missing", cached)


def test_nominatim_search_and_result_normalization_use_http_payload(monkeypatch):
    settings = SimpleNamespace(
        nominatim_url="https://example.invalid/search",
        nominatim_user_agent="pannes-historiques-test",
        db_path=":memory:",
    )
    service = GeocodingService(settings)
    payload = [
        {
            "lat": "45.5",
            "lon": "-73.6",
            "importance": "0.8",
            "type": "house",
            "address": {"town": "Westmount", "state": "Quebec", "postcode": "H3Z"},
        }
    ]
    monkeypatch.setattr(
        "app.geocoding.urllib.request.urlopen",
        lambda _request, timeout: nullcontext(io.BytesIO(json.dumps(payload).encode("utf-8"))),
    )
    normalized = NormalizedAddress(
        original="1 Test Street",
        normalized_line="1 test street, quebec",
        street_line="1 test street",
        city="",
        province="QC",
        postal_code="",
        unit="",
    )

    result = service._nominatim(normalized)

    assert result is not None
    assert result.quality == "address"
    assert result.city == "Westmount"
