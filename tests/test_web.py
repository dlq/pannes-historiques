def test_index_renders(app_client):
    response = app_client.get("/")

    assert response.status_code == 200
    assert "Pannes Historiques" in response.get_data(as_text=True)


def test_search_route_uses_fixed_defaults(app_client):
    response = app_client.post("/search", data={"q": "5220 Rue Jeanne-Mance", "lang": "en"})

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is False
    assert call["record_history"] is False


def test_search_location_map_route_uses_fixed_defaults(app_client):
    response = app_client.get(
        "/search-location-map?latitude=45.5&longitude=-73.56&accuracy_m=20&lang=en"
    )

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_location_calls[-1]
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True
    assert call["record_history"] is False


def test_autocomplete_route_returns_suggestions(app_client):
    response = app_client.get("/autocomplete?q=5220%20Rue%20Jeanne&lang=en")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["suggestions"][0]["value"] == "5220 Rue Jeanne-Mance"


def test_map_context_geometries_route_returns_json(app_client):
    response = app_client.get("/map-context-geometries")

    assert response.status_code == 200
    assert response.get_json() == {"geometries": []}


def test_internal_disclosures_export_requires_internal_header(app_client):
    response = app_client.get("/internal/disclosures/export")

    assert response.status_code == 404


def test_internal_disclosures_export_allows_internal_header(app_client):
    response = app_client.get(
        "/internal/disclosures/export",
        headers={"X-Cloudflare-Internal": "1"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"source_keys": []}


def test_cron_disclosures_batch_rejects_missing_scheduled_header(app_client):
    response = app_client.post("/cron/disclosures/batch", json={"source_keys": ["DAI-2022-0386"]})

    assert response.status_code == 404


def test_cron_disclosures_batch_rejects_invalid_source_keys(app_client):
    response = app_client.post(
        "/cron/disclosures/batch",
        json={"source_keys": "DAI-2022-0386"},
        headers={"X-Cloudflare-Scheduled": "1"},
    )

    assert response.status_code == 400
