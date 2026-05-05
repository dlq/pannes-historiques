from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import geopandas as gpd
from shapely import coverage_is_valid
from shapely.geometry import shape

DEFAULT_TOLERANCE_M = 1000
DEFAULT_DISCLOSURE_TOLERANCE_M = 100
PROJECTED_CRS = "EPSG:32198"
WGS84_CRS = "EPSG:4326"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the static topology-preserved administrative-region map geometry asset."
    )
    parser.add_argument("--db", default="data/app.db", help="SQLite database path.")
    parser.add_argument(
        "--output",
        default="app/static/regional_metric_geometries.json",
        help="Output JSON asset path.",
    )
    parser.add_argument(
        "--disclosure-output",
        default="app/static/disclosure_geometries.json",
        help="Output JSON asset path for conservative DAI/disclosure geometries.",
    )
    parser.add_argument(
        "--tolerance-m",
        type=float,
        default=DEFAULT_TOLERANCE_M,
        help="Coverage simplification tolerance in metres.",
    )
    parser.add_argument(
        "--disclosure-tolerance-m",
        type=float,
        default=DEFAULT_DISCLOSURE_TOLERANCE_M,
        help="Per-feature DAI/disclosure simplification tolerance in metres.",
    )
    return parser.parse_args()


def load_region_geometries(db_path: Path) -> gpd.GeoDataFrame:
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT m.geography_label, g.geometry_geojson
            FROM disclosure_annual_metrics m
            JOIN disclosure_sources s ON s.id = m.source_id
            JOIN disclosure_geometries g
              ON g.source_id = s.id
             AND g.geography_label = m.geography_label
             AND g.id = (
                SELECT g2.id
                FROM disclosure_geometries g2
                WHERE g2.source_id = s.id
                  AND g2.geography_label = m.geography_label
                  AND g2.geometry_source != 'fallback_area'
                ORDER BY g2.id DESC
                LIMIT 1
             )
            WHERE m.geography_type = 'administrative_region'
              AND s.dai_number = 'DAI-2026-0077'
            ORDER BY m.geography_label
            """
        ).fetchall()

    records = [
        {
            "geometry_key": f"regional:{label}",
            "geography_label": label,
            "geometry": shape(json.loads(geometry_geojson)),
        }
        for label, geometry_geojson in rows
    ]
    return gpd.GeoDataFrame(records, geometry="geometry", crs=WGS84_CRS)


def load_disclosure_geometries(db_path: Path) -> gpd.GeoDataFrame:
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT g.geography_type, g.geography_label, g.geometry_geojson
            FROM disclosure_geometries g
            WHERE g.geography_type != 'administrative_region'
              AND g.id = (
                SELECT g2.id
                FROM disclosure_geometries g2
                WHERE g2.geography_type = g.geography_type
                  AND g2.geography_label = g.geography_label
                ORDER BY CASE WHEN g2.geometry_source = 'fallback_area' THEN 1 ELSE 0 END,
                         g2.id DESC
                LIMIT 1
              )
            ORDER BY g.geography_type, g.geography_label
            """
        ).fetchall()

    records = [
        {
            "geometry_key": f"disclosure:{geography_type}:{geography_label}",
            "geography_label": geography_label,
            "geography_type": geography_type,
            "geometry": shape(json.loads(geometry_geojson)),
        }
        for geography_type, geography_label, geometry_geojson in rows
    ]
    return gpd.GeoDataFrame(records, geometry="geometry", crs=WGS84_CRS)


def simplify_coverage(regions: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    projected = regions.to_crs(PROJECTED_CRS)
    if not coverage_is_valid(projected.geometry.array):
        raise SystemExit("Administrative-region geometries are not a valid coverage.")

    simplified = projected.copy()
    simplified.geometry = projected.geometry.simplify_coverage(tolerance_m)
    if not coverage_is_valid(simplified.geometry.array):
        raise SystemExit("Simplified administrative-region geometries are not a valid coverage.")

    return simplified.to_crs(WGS84_CRS)


def simplify_features(geometries: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    # DAI/disclosure shapes are overlapping area references, not one edge-matched coverage.
    # Keep this conservative and do not treat it like the administrative-region layer.
    projected = geometries.to_crs(PROJECTED_CRS)
    simplified = projected.copy()
    simplified.geometry = projected.geometry.simplify(tolerance_m, preserve_topology=True)
    return simplified.to_crs(WGS84_CRS)


def write_asset(
    regions: gpd.GeoDataFrame, output_path: Path, tolerance_m: float, *, kind: str
) -> None:
    geometries = [
        {
            "kind": kind,
            "geometryKey": row.geometry_key,
            "geometry": row.geometry.__geo_interface__,
        }
        for row in regions.itertuples(index=False)
    ]
    payload = {
        "toleranceM": tolerance_m,
        "geometries": geometries,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    regions = load_region_geometries(Path(args.db))
    simplified = simplify_coverage(regions, args.tolerance_m)
    write_asset(simplified, Path(args.output), args.tolerance_m, kind="regional_metric")

    disclosure_geometries = load_disclosure_geometries(Path(args.db))
    simplified_disclosures = simplify_features(
        disclosure_geometries,
        args.disclosure_tolerance_m,
    )
    write_asset(
        simplified_disclosures,
        Path(args.disclosure_output),
        args.disclosure_tolerance_m,
        kind="disclosure",
    )


if __name__ == "__main__":
    main()
