from app.addressing import NormalizedAddress
from app.services import clearly_outside_quebec_query, point_in_polygon, within_quebec_bounds


def test_point_in_polygon_detects_inside_and_outside_points():
    polygon = [[-73.61, 45.51], [-73.59, 45.51], [-73.59, 45.53], [-73.61, 45.53]]

    assert point_in_polygon(-73.60, 45.52, polygon) is True
    assert point_in_polygon(-73.70, 45.52, polygon) is False


def test_within_quebec_bounds_handles_simple_cases():
    assert within_quebec_bounds(45.5019, -73.5674) is True
    assert within_quebec_bounds(43.7, -79.4) is False


def test_clearly_outside_quebec_query_flags_ottawa_ontario():
    normalized = NormalizedAddress(
        original="111 Wellington St, Ottawa, ON",
        normalized_line="111 wellington st, ottawa, ON",
        street_line="111 wellington st",
        city="ottawa",
        province="ON",
        postal_code="K1A0A9",
        unit="",
    )

    assert clearly_outside_quebec_query(normalized) is True


def test_clearly_outside_quebec_query_does_not_flag_montreal():
    normalized = NormalizedAddress(
        original="5220 Rue Jeanne-Mance, Montreal, QC",
        normalized_line="5220 rue jeanne-mance, montreal, QC",
        street_line="5220 rue jeanne-mance",
        city="montreal",
        province="QC",
        postal_code="H2V4G7",
        unit="",
    )

    assert clearly_outside_quebec_query(normalized) is False
