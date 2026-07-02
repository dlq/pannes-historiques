from app.hydro import maybe_int, parse_centroid, parse_kml_polygons, safe_get


def test_maybe_int_handles_feed_nulls_and_numeric_strings():
    assert maybe_int(None) is None
    assert maybe_int("") is None
    assert maybe_int("null") is None
    assert maybe_int("42") == 42
    assert maybe_int("42.5") is None


def test_parse_centroid_accepts_feed_arrays_and_string_coordinates():
    assert parse_centroid([45.52, -73.6]) == (45.52, -73.6)
    assert parse_centroid("[45.52, -73.6]") == (45.52, -73.6)
    assert parse_centroid("") == (None, None)
    assert parse_centroid(None) == (None, None)


def test_safe_get_returns_none_for_missing_feed_columns():
    assert safe_get(["a", "b"], 1) == "b"
    assert safe_get(["a", "b"], 4) is None


def test_parse_kml_polygons_extracts_geometry_bbox_and_centroid():
    kml = """
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Placemark>
          <name>poly-1</name>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>
                  -73.62,45.50,0 -73.58,45.50,0 -73.58,45.54,0 -73.62,45.54,0 -73.62,45.50,0
                </coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>
        <Placemark>
          <name>line-only</name>
          <LineString>
            <coordinates>-73.6,45.5,0 -73.5,45.6,0</coordinates>
          </LineString>
        </Placemark>
        <Placemark>
          <name>too-small</name>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>-73.6,45.5,0 -73.5,45.6,0</coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>
      </Document>
    </kml>
    """

    features = parse_kml_polygons(kml)

    assert features == [
        {
            "polygon_id": "poly-1",
            "name": "poly-1",
            "centroid_lon": -73.604,
            "centroid_lat": 45.516,
            "bbox": [-73.62, 45.5, -73.58, 45.54],
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-73.62, 45.5],
                        [-73.58, 45.5],
                        [-73.58, 45.54],
                        [-73.62, 45.54],
                        [-73.62, 45.5],
                    ]
                ],
            },
            "raw_coordinates": "-73.62,45.50,0 -73.58,45.50,0 -73.58,45.54,0 -73.62,45.54,0 -73.62,45.50,0",
        }
    ]
