from types import SimpleNamespace

from conftest import make_search_result

from app.views import context_geometry_payload, result_context


def test_result_context_builds_display_address_and_map_payload():
    result = make_search_result()
    context = result_context("en", result)

    assert context["display_address"] == "5220 Rue Jeanne-Mance, Montreal, Quebec, H2V 4G7"
    assert context["map_payload"]["radiusM"] == 5000
    assert context["map_payload"]["contextGeometryUrl"] == "/map-context-geometries"


def test_result_context_maps_error_keys():
    result = make_search_result()
    result.error = "outside_quebec"

    context = result_context("en", result)

    assert context["error_message"] == "This tool currently supports locations in Quebec only."


def test_result_context_uses_add_city_message_for_under_specific_geocode_failure():
    result = make_search_result()
    result.error = "geocode_failed"
    result.normalized = result.normalized.__class__(
        original="1010 rue Sherbrooke O.",
        normalized_line="1010 rue sherbrooke ouest, QC",
        street_line="1010 rue sherbrooke ouest",
        city="",
        province="QC",
        postal_code="",
        unit="",
    )

    context = result_context("en", result)

    assert (
        context["error_message"]
        == "The address could not be matched. Add the city or postal code and try again."
    )


def test_context_geometry_payload_prefers_static_or_inline_geometry():
    result = SimpleNamespace(
        regional_metric_layers=[
            {
                "geography_label": "Montreal",
                "geometry_geojson": {"type": "Polygon", "coordinates": []},
            }
        ],
        disclosure_layers=[
            {
                "geography_type": "municipality",
                "municipality_code": "Outremont",
                "geometry_geojson": {"type": "Polygon", "coordinates": []},
            }
        ],
    )

    payload = context_geometry_payload(result)

    assert payload["geometries"][0]["kind"] == "regional_metric"
    assert payload["geometries"][1]["kind"] == "disclosure"
