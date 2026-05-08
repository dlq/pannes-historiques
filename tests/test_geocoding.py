from types import SimpleNamespace

from app.geocoding import GeocodingService


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
