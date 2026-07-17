import json
import re


def test_index_renders(app_client):
    response = app_client.get("/")

    assert response.status_code == 200
    assert "Pannes Historiques" in response.get_data(as_text=True)


def test_index_preserves_stable_overview_map_bounds(app_client):
    response = app_client.get("/?lang=en")
    html = response.get_data(as_text=True)
    match = re.search(r"data-map='([^']+)'", html)

    assert match is not None
    payload = json.loads(match.group(1))
    assert payload["overviewBounds"] == [[-76.6, 45.0], [-67.0, 49.5]]
    assert payload["preserveInitialView"] is True


def test_address_index_keeps_radius_based_map_framing(app_client):
    response = app_client.get("/?lang=en&q=5220+Rue+Jeanne-Mance")
    html = response.get_data(as_text=True)
    match = re.search(r"data-map='([^']+)'", html)

    assert match is not None
    payload = json.loads(match.group(1))
    assert payload["overviewBounds"] is None
    assert payload["preserveInitialView"] is False
    assert payload["radiusM"] == 2000


def test_index_includes_pwa_metadata(app_client):
    response = app_client.get("/")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "viewport-fit=cover" in html
    assert '<meta name="theme-color" content="#ffffff">' in html
    assert '<meta name="apple-mobile-web-app-capable" content="yes">' in html
    assert 'href="/static/manifest.webmanifest"' in html
    assert 'href="/static/app-icon-180.png"' in html


def test_index_includes_hidden_app_heading(app_client):
    response = app_client.get("/?lang=en")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '<h1 class="sr-only">Outage History map</h1>' in html


def test_index_includes_web_quality_metadata_and_no_tailwind_cdn(app_client):
    response = app_client.get("/?lang=en")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '<meta name="description"' in html
    assert (
        'content="Explore current and planned Hydro-Quebec outages and retained pannes.ca observations near Quebec addresses."'
        in html
    )
    assert '<link rel="canonical" href="https://pannes.ca/?lang=en">' in html
    assert '<meta property="og:title" content="Outage History">' in html
    assert '<meta property="og:url" content="https://pannes.ca/?lang=en">' in html
    assert '<meta name="twitter:card" content="summary">' in html
    assert "cdn.tailwindcss.com" not in html


def test_search_index_canonical_metadata_preserves_query(app_client):
    response = app_client.get("/?lang=en&q=5220%20Rue%20Jeanne-Mance")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert (
        '<link rel="canonical" href="https://pannes.ca/?lang=en&amp;q=5220+Rue+Jeanne-Mance">'
    ) in html
    assert (
        '<meta property="og:url" content="https://pannes.ca/?lang=en&amp;q=5220+Rue+Jeanne-Mance">'
    ) in html


def test_about_page_includes_web_quality_metadata(app_client):
    response = app_client.get("/about?lang=en")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert '<meta name="description"' in html
    assert (
        'content="Learn what Pannes Historiques archives, where the outage evidence comes from, and what its limits are."'
        in html
    )
    assert '<link rel="canonical" href="https://pannes.ca/about?lang=en">' in html
    assert '<meta property="og:title" content="About Outage History">' in html
    assert '<meta name="twitter:card" content="summary">' in html


def test_robots_txt_points_to_sitemap(app_client):
    response = app_client.get("/robots.txt")
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "text/plain"
    assert "User-agent: *" in body
    assert "Allow: /" in body
    assert "Disallow: /debug/" in body
    assert "Sitemap: https://pannes.ca/sitemap.xml" in body
    assert response.headers["Cache-Control"] == "public, max-age=3600"


def test_sitemap_xml_lists_public_pages(app_client):
    response = app_client.get("/sitemap.xml")
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "application/xml"
    assert "<loc>https://pannes.ca/?lang=fr</loc>" in body
    assert "<loc>https://pannes.ca/?lang=en</loc>" in body
    assert "<loc>https://pannes.ca/about?lang=fr</loc>" in body
    assert "<loc>https://pannes.ca/about?lang=en</loc>" in body
    assert response.headers["Cache-Control"] == "public, max-age=3600"


def test_static_assets_have_version_aware_cache_headers(app_client):
    versioned_response = app_client.get("/static/app.css?v=test-version")
    unversioned_response = app_client.get("/static/app.css")

    assert versioned_response.status_code == 200
    assert versioned_response.headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert unversioned_response.status_code == 200
    assert unversioned_response.headers["Cache-Control"] == "public, max-age=300"


def test_index_links_to_about_page(app_client):
    response = app_client.get("/?lang=en")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert 'href="/about?lang=en"' in html
    assert 'href="/about?lang=en#privacy"' in html
    assert ">About</a>" in html


def test_about_page_renders_in_english(app_client):
    response = app_client.get("/about?lang=en")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "About Outage History" in html
    assert "Data sources" in html
    assert "OpenStreetMap&#39;s Nominatim" in html
    assert "local storage" in html
    assert "no accounts, advertising, analytics trackers, or application cookies" in html
    assert "not yet an automatic expiry" in html
    assert 'href="mailto:contact@pannes.ca"' in html
    assert "contact@pannes.ca" in html
    assert 'href="/?lang=en"' in html


def test_about_page_renders_in_french(app_client):
    response = app_client.get("/about?lang=fr")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "À propos de Pannes Historiques" in html
    assert "Sources de données" in html
    assert "service Nominatim d&#39;OpenStreetMap" in html
    assert "stockage local de ce navigateur" in html
    assert "aucun compte, publicité, outil de suivi analytique ni témoin applicatif" in html
    assert "Aucune expiration automatique" in html
    assert 'href="mailto:contact@pannes.ca"' in html
    assert "contact@pannes.ca" in html
    assert 'href="/?lang=fr"' in html


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
    assert b"pannes-historiques-v0.4.4-close-handler-fix" in response.data
    assert b"/static/app-icon-180.png" in response.data
    assert b"/static/icons.svg" in response.data
    assert b"/static/sheet.js" in response.data
    assert b"/static/vendor/maplibre/maplibre-gl.js" in response.data
    assert b"/static/vendor/maplibre/maplibre-gl.css" in response.data
    assert b"/static/ui-format.js" in response.data
    assert b"/static/offline.html" in response.data


def test_search_route_uses_typed_address_defaults(app_client):
    response = app_client.post("/search", data={"q": "5220 Rue Jeanne-Mance", "lang": "en"})

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 2000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True
    assert call["record_history"] is False


def test_index_location_url_uses_coordinates(app_client):
    response = app_client.get("/?lang=en&lat=45.5&lon=-73.56&accuracy_m=20")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'data-mode="address"' in html
    call = app_client.application.testing_stub_service.search_location_calls[-1]
    assert call["latitude"] == 45.5
    assert call["longitude"] == -73.56
    assert call["accuracy_m"] == 20
    assert call["radius_m"] == 5000
    assert call["days"] == 1825
    assert call["include_planned"] is True
    assert call["include_map_layers"] is True
    assert call["record_history"] is False


def test_typed_address_search_defaults_to_two_kilometers_and_renders_radius_control(app_client):
    response = app_client.get("/?lang=en&q=5220%20Rue%20Jeanne-Mance")

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 2000
    html = response.get_data(as_text=True)
    assert 'id="nearby-radius"' in html
    assert re.search(r'<option value="2000"\s+selected>2 km</option>', html)


def test_typed_address_search_accepts_supported_radius_setting(app_client):
    response = app_client.get("/?lang=en&q=5220%20Rue%20Jeanne-Mance&radius_m=5000")

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 5000
    assert re.search(
        r'<option value="5000"\s+selected>5 km</option>', response.get_data(as_text=True)
    )


def test_typed_address_search_rejects_unsupported_radius_setting(app_client):
    response = app_client.get("/?lang=en&q=5220%20Rue%20Jeanne-Mance&radius_m=3000")

    assert response.status_code == 200
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 2000
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


def test_collect_route_is_private_by_default(app_client):
    response = app_client.get("/collect")

    assert response.status_code == 404


def test_collect_route_returns_service_payload_when_debug_enabled(debug_app_client):
    response = debug_app_client.get("/collect")

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect"}


def test_collect_changed_route_returns_service_payload_when_internal(app_client):
    response = app_client.post("/collect/changed", headers={"X-Cloudflare-Internal": "1"})

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_changed"}


def test_collect_bis_route_returns_service_payload_when_internal(app_client):
    response = app_client.get("/collect/bis", headers={"X-Cloudflare-Internal": "1"})

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_current_outages"}


def test_collect_aip_route_returns_service_payload_when_internal(app_client):
    response = app_client.get("/collect/aip", headers={"X-Cloudflare-Internal": "1"})

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_planned_interruptions"}


def test_collect_disclosures_route_returns_service_payload_when_internal(app_client):
    response = app_client.post("/collect/disclosures", headers={"X-Cloudflare-Internal": "1"})

    assert response.status_code == 200
    assert response.get_json() == {"kind": "collect_disclosures"}


def test_cron_hydro_route_requires_scheduled_header(app_client):
    response = app_client.post("/cron/hydro")

    assert response.status_code == 404


def test_cron_hydro_route_returns_service_payload_when_scheduled(app_client):
    response = app_client.post("/cron/hydro", headers={"X-Cloudflare-Scheduled": "1"})

    assert response.status_code == 200
    assert response.get_json() == {"kind": "run_changed_collection_job"}


def test_cron_disclosures_route_requires_scheduled_header(app_client):
    response = app_client.post("/cron/disclosures")

    assert response.status_code == 404


def test_cron_disclosures_route_returns_service_payload_when_scheduled(app_client):
    response = app_client.post("/cron/disclosures", headers={"X-Cloudflare-Scheduled": "1"})

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
        "/internal/raw-snapshot?source_type=bismarkers&source_version=test",
        headers={"X-Cloudflare-Internal": "1"},
    )

    assert response.status_code == 404


def test_favicon_alias_redirects_to_current_asset(app_client):
    response = app_client.get("/favicon.ico")

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/static/favicon.svg")


def test_stale_leaflet_tombstones_are_cache_safe(app_client):
    for path in ("/static/vendor/leaflet/leaflet.css", "/static/vendor/leaflet/leaflet.js"):
        response = app_client.get(path)

        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"


def test_sheet_returns_localized_error_fragment_when_context_building_fails(
    app_client, monkeypatch
):
    service = app_client.application.config["APP_SERVICE"]

    def raise_error(*args, **kwargs):
        raise RuntimeError("fixture failure")

    monkeypatch.setattr(service, "current_operational_map_layers", raise_error)
    response = app_client.get("/sheet?lang=en&domain=current")

    assert response.status_code == 200
    assert "The content could not load. Try again." in response.get_data(as_text=True)


def test_sheet_explore_domains_render(app_client):
    for domain, marker in [
        ("current", 'data-domain="current"'),
        ("planned", 'data-domain="planned"'),
        ("archive", 'data-domain="archive"'),
        ("context", 'data-domain="context"'),
    ]:
        response = app_client.get(f"/sheet?lang=en&domain={domain}")
        assert response.status_code == 200
        html = response.get_data(as_text=True)
        assert marker in html
        assert 'data-mode="explore"' in html
        assert "data-map-update" in html


def test_sheet_archive_lists_territory_bins(app_client):
    response = app_client.get("/sheet?lang=en&domain=archive")
    html = response.get_data(as_text=True)
    assert "Montréal" in html
    assert "Observed outage report" in html


def test_sheet_with_address_renders_overview(app_client):
    response = app_client.get("/sheet?lang=en&domain=overview&q=5220+Rue+Jeanne-Mance")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'data-mode="address"' in html
    assert 'data-domain="overview"' in html
    assert "ph-hero-card" in html
    call = app_client.application.testing_stub_service.search_calls[-1]
    assert call["radius_m"] == 2000
    assert call["record_history"] is False


def test_sheet_unknown_domain_falls_back(app_client):
    response = app_client.get("/sheet?lang=en&domain=bogus")
    assert response.status_code == 200
    assert 'data-domain="current"' in response.get_data(as_text=True)

    with_address = app_client.get("/sheet?lang=en&domain=bogus&q=5220+Rue+Jeanne-Mance")
    assert with_address.status_code == 200
    assert 'data-domain="overview"' in with_address.get_data(as_text=True)


def test_index_boot_sheet_omits_duplicate_map_payload(app_client):
    response = app_client.get("/?lang=en")
    html = response.get_data(as_text=True)
    assert 'data-boot="1"' in html
    assert "data-map-update" not in html
