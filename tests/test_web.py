import json


def test_index_renders(app_client):
    response = app_client.get("/")

    assert response.status_code == 200
    assert "Pannes Historiques" in response.get_data(as_text=True)


def test_index_includes_pwa_metadata(app_client):
    response = app_client.get("/")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "viewport-fit=cover" in html
    assert '<meta name="theme-color" content="#223654">' in html
    assert '<meta name="apple-mobile-web-app-capable" content="yes">' in html
    assert 'href="/static/manifest.webmanifest"' in html
    assert 'href="/static/app-icon-180.png"' in html


def test_manifest_route_exposes_installability_metadata(app_client):
    response = app_client.get("/static/manifest.webmanifest")

    assert response.status_code == 200
    manifest = json.loads(response.get_data(as_text=True))
    assert manifest["name"] == "Pannes Historiques"
    assert manifest["display"] == "standalone"
    assert manifest["scope"] == "/"
    assert manifest["start_url"] == "/?source=pwa"
    assert {icon["purpose"] for icon in manifest["icons"]} == {"any", "maskable"}
    assert {icon["sizes"] for icon in manifest["icons"]} >= {"192x192", "512x512"}


def test_service_worker_route_has_root_scope(app_client):
    response = app_client.get("/service-worker.js")

    assert response.status_code == 200
    assert response.headers["Service-Worker-Allowed"] == "/"
    assert response.headers["Cache-Control"] == "no-cache"
    assert b"pannes-historiques-v0.2.2-js-modules-1" in response.data
    assert b"/static/app-icon-180.png" in response.data
    assert b"/static/map-layers.js" in response.data
    assert b"/static/ui-format.js" in response.data
    assert b"/static/offline.html" in response.data


def test_search_route_uses_fixed_defaults(app_client):
    response = app_client.post("/search", data={"q": "5220 Rue Jeanne-Mance", "lang": "en"})

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True
    assert call["record_history"] is False


def test_index_location_url_uses_coordinates(app_client):
    response = app_client.get("/?lang=en&lat=45.5&lon=-73.56&accuracy_m=20")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Current location (45.50000, -73.56000)" in html
    call = app_client.application.testing_stub_service.search_location_calls[-1]
    assert call["latitude"] == 45.5
    assert call["longitude"] == -73.56
    assert call["accuracy_m"] == 20
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True


def test_search_map_route_uses_fixed_defaults(app_client):
    response = app_client.get("/search-map?q=5220%20Rue%20Jeanne-Mance&lang=en")

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True
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


def test_search_location_route_uses_fixed_defaults(app_client):
    response = app_client.post(
        "/search-location",
        data={"latitude": "45.5", "longitude": "-73.56", "accuracy_m": "20", "lang": "en"},
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
    payload = response.get_json()
    assert payload["geometries"]
    assert payload["geometries"][0]["kind"] == "regional_metric"


def test_debug_timing_search_route_is_not_public_by_default(app_client):
    response = app_client.get("/debug/timing/search?q=5220%20Rue%20Jeanne-Mance&lang=en")

    assert response.status_code == 404


def test_debug_timing_search_route_returns_expected_shape_when_enabled(debug_app_client):
    response = debug_app_client.get("/debug/timing/search?q=5220%20Rue%20Jeanne-Mance&lang=en")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["error"] is None
    assert payload["cache_hit"] is True
    assert payload["matches"] == 0
    assert "timing" in payload


def test_healthz_route_returns_ok(app_client):
    response = app_client.get("/healthz")

    assert response.status_code == 200
    assert response.get_json() == {"ok": True}


def test_collect_route_returns_service_payload(app_client):
    response = app_client.get("/collect")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect"}


def test_collect_changed_route_returns_service_payload(app_client):
    response = app_client.post("/collect/changed")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_changed"}


def test_collect_bis_route_returns_service_payload(app_client):
    response = app_client.get("/collect/bis")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_current_outages"}


def test_collect_aip_route_returns_service_payload(app_client):
    response = app_client.get("/collect/aip")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_planned_interruptions"}


def test_collect_disclosures_route_returns_service_payload(app_client):
    response = app_client.post("/collect/disclosures")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_disclosures"}


def test_cron_hydro_route_returns_service_payload(app_client):
    response = app_client.post("/cron/hydro")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "run_changed_collection_job"}


def test_cron_disclosures_route_returns_service_payload(app_client):
    response = app_client.post("/cron/disclosures")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_disclosures_if_due"}


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


def test_internal_disclosure_source_file_requires_internal_header(app_client):
    response = app_client.get("/internal/disclosures/source-file?source_key=DAI-2022-0386")

    assert response.status_code == 404


def test_internal_disclosure_source_file_returns_404_when_missing(app_client):
    response = app_client.get(
        "/internal/disclosures/source-file?source_key=DAI-2022-0386",
        headers={"X-Cloudflare-Internal": "1"},
    )

    assert response.status_code == 404


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


def test_cron_disclosures_batch_accepts_valid_source_keys(app_client):
    response = app_client.post(
        "/cron/disclosures/batch",
        json={"source_keys": ["DAI-2022-0386"]},
        headers={"X-Cloudflare-Scheduled": "1"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"source_keys": ["DAI-2022-0386"]}


def test_cron_disclosures_parse_source_requires_scheduled_header(app_client):
    response = app_client.post("/cron/disclosures/parse-source", data=b"payload")

    assert response.status_code == 404


def test_cron_disclosures_parse_source_requires_source_key(app_client):
    response = app_client.post(
        "/cron/disclosures/parse-source",
        data=b"payload",
        headers={"X-Cloudflare-Scheduled": "1"},
    )

    assert response.status_code == 400


def test_cron_disclosures_parse_source_requires_non_empty_payload(app_client):
    response = app_client.post(
        "/cron/disclosures/parse-source",
        data=b"",
        headers={"X-Cloudflare-Scheduled": "1", "X-Disclosure-Source-Key": "DAI-2022-0386"},
    )

    assert response.status_code == 400


def test_cron_disclosures_parse_source_accepts_valid_payload(app_client):
    response = app_client.post(
        "/cron/disclosures/parse-source",
        data=b"payload",
        headers={
            "X-Cloudflare-Scheduled": "1",
            "X-Disclosure-Source-Key": "DAI-2022-0386",
            "Content-Type": "application/pdf",
        },
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "source_key": "DAI-2022-0386",
        "size": 7,
        "content_type": "application/pdf",
    }


def test_internal_raw_snapshot_requires_internal_header(app_client):
    response = app_client.get("/internal/raw-snapshot?payload_path=test")

    assert response.status_code == 404


def test_internal_raw_snapshot_returns_404_when_missing(app_client):
    response = app_client.get(
        "/internal/raw-snapshot?payload_path=test",
        headers={"X-Cloudflare-Internal": "1"},
    )

    assert response.status_code == 404
