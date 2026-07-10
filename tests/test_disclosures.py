import pytest

from app.disclosures import (
    AccessResponsePageParser,
    DisclosureSource,
    content_type_from_url,
    fallback_circle_polygon,
    geometry_bbox,
    is_outage_related_text,
    normalize_datetime,
    normalize_key,
    normalize_row_keys,
    parse_multi_year_regional_metrics,
    parse_pdf_row_line,
    parse_single_period_regional_metrics,
    relation_to_geojson,
    sources_from_discovered_article,
)


def test_normalize_key_handles_accents_apostrophes_and_spacing():
    assert normalize_key("DESCRIPTION CAUSE DETAILLÉE") == "description_cause_detaillee"
    assert normalize_key("L'Île-aux-Allumettes") == "lile_aux_allumettes"


def test_normalize_row_keys_applies_key_normalization_to_entire_mapping():
    row = {"Date début": "2025-01-01", "Durée (SEC)": 60}

    assert normalize_row_keys(row) == {"date_debut": "2025-01-01", "duree_sec": 60}


def test_normalize_datetime_handles_empty_and_iso_t_values():
    assert normalize_datetime("") is None
    assert normalize_datetime(None) is None
    assert normalize_datetime("2025-01-01T12:34:56.789Z") == "2025-01-01 12:34:56"


def test_access_response_parser_keeps_article_text_and_links():
    parser = AccessResponsePageParser()

    parser.feed(
        """
        <article id="dai-2026-0099">
          <h2>Objet : Pannes dans la ville de Sainte-Julie</h2>
          <a href="/data/loi-sur-acces/pdf/DAI-2026-0099-lettre-reponse.pdf">Lettre</a>
          <a href="/data/loi-sur-acces/xls/DAI-2026-0099-document.xlsx">Document Excel</a>
        </article>
        """
    )

    assert len(parser.articles) == 1
    article = parser.articles[0]
    assert article["id"] == "dai-2026-0099"
    assert "Pannes dans la ville de Sainte-Julie" in " ".join(article["text_parts"])
    assert [link["text_parts"] for link in article["links"]] == [["Lettre"], ["Document Excel"]]


def test_discovered_article_skips_response_letter_when_data_attachment_exists():
    article = {
        "id": "dai-2026-0099",
        "links": [
            {
                "href": "/data/loi-sur-acces/pdf/DAI-2026-0099-lettre-reponse.pdf",
                "text_parts": ["Lettre"],
            },
            {
                "href": "/data/loi-sur-acces/xls/DAI-2026-0099-document.xlsx",
                "text_parts": ["Document Excel"],
            },
        ],
    }
    text = (
        "Objet : Pannes dans la ville de Sainte-Julie "
        "Publié sur le site Web : 2026-02-03 "
        "Transmis au demandeur : 2026-02-02"
    )

    sources = sources_from_discovered_article(article, text)

    assert len(sources) == 1
    source = sources[0]
    assert source.dai_number == "DAI-2026-0099"
    assert source.format == "xlsx"
    assert source.extraction_method == "xlsx_rows"
    assert source.geography_label == "Sainte-Julie"
    assert source.geography_type == "municipality"
    assert source.geometry_query == "Sainte-Julie, Québec, Canada"
    assert source.published_date == "2026-02-03"
    assert source.transmitted_date == "2026-02-02"


def test_outage_related_text_matches_accents_and_english_negative_case():
    assert is_outage_related_text("Réponse sur les interruptions et la continuité de service")
    assert not is_outage_related_text("Contrats de fourniture et grille tarifaire")


def test_pdf_row_line_extracts_known_cause_and_trailing_municipality():
    source = DisclosureSource(
        dai_number="DAI-2026-0042",
        title="Pannes multi-municipalités",
        attachment_url="https://example.invalid/document.pdf",
        format="pdf",
        geography_label="Pontiac",
        geography_type="municipality_group",
        extraction_method="pdf_rows",
        precision_label="municipality_context",
    )

    row = parse_pdf_row_line(
        "2025-01-02 03:04:05 2025-01-02 05:04:05 7200 Défaillance Waltham",
        source,
    )

    assert row == {
        "start_time": "2025-01-02 03:04:05",
        "end_time": "2025-01-02 05:04:05",
        "duration_seconds": 7200,
        "cause": "Défaillance",
        "row_area": "Waltham",
        "geography_label": "Waltham",
        "raw_text": "2025-01-02 03:04:05 2025-01-02 05:04:05 7200 Défaillance Waltham",
    }


def test_single_period_regional_metrics_recombines_split_thousands():
    source = DisclosureSource(
        dai_number="DAI-2026-0077",
        title="Pannes par région administrative - 2025",
        attachment_url="https://example.invalid/document.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
    )

    rows = parse_single_period_regional_metrics(
        [
            "Montréal 1 234 56 7 890",
            "Vue provinciale (somme) 12 345 67 8 901",
        ],
        source,
    )

    assert rows == [
        {
            "year": 2025,
            "period_label": "2025",
            "geography_label": "Montréal",
            "geography_type": "administrative_region",
            "outage_count": 1234,
            "average_duration_minutes": 56,
            "continuity_index_minutes": 7890,
            "notes": "Pannes par région administrative - 2025",
            "raw_text": "Montréal 1 234 56 7 890",
        },
        {
            "year": 2025,
            "period_label": "2025",
            "geography_label": "Vue provinciale (somme)",
            "geography_type": "province",
            "outage_count": 12345,
            "average_duration_minutes": 67,
            "continuity_index_minutes": 8901,
            "notes": "Pannes par région administrative - 2025",
            "raw_text": "Vue provinciale (somme) 12 345 67 8 901",
        },
    ]


def test_multi_year_regional_metrics_combines_three_metric_tables():
    source = DisclosureSource(
        dai_number="DAI-2024-0012",
        title="Informations sur les pannes par régions administratives - 2019 à 2023",
        attachment_url="https://example.invalid/document.pdf",
        format="pdf",
        geography_label="Québec",
        geography_type="administrative_region_set",
        extraction_method="regional_metrics_pdf",
        precision_label="administrative_region_aggregate",
    )

    rows = parse_multi_year_regional_metrics(
        [
            "Montréal 10 11 12 13 14",
            "Vue provinciale 100 101 102 103 104",
            "Montréal 20 21 22 23 24",
            "Vue provinciale 200 201 202 203 204",
            "Montréal 30 31 32 33 34",
            "Vue provinciale 300 301 302 303 304",
        ],
        source,
    )

    montreal_2021 = next(
        row for row in rows if row["geography_label"] == "Montréal" and row["year"] == 2021
    )
    provincial_2023 = next(
        row for row in rows if row["geography_label"] == "Vue provinciale" and row["year"] == 2023
    )

    assert montreal_2021["outage_count"] == 12
    assert montreal_2021["average_duration_minutes"] == 22
    assert montreal_2021["continuity_index_minutes"] == 32
    assert montreal_2021["geography_type"] == "administrative_region"
    assert provincial_2023["outage_count"] == 104
    assert provincial_2023["average_duration_minutes"] == 204
    assert provincial_2023["continuity_index_minutes"] == 304
    assert provincial_2023["geography_type"] == "province"


def test_relation_to_geojson_stitches_outer_segments_into_closed_polygon():
    relation = {
        "members": [
            {
                "role": "outer",
                "geometry": [
                    {"lon": -73.7, "lat": 45.4},
                    {"lon": -73.5, "lat": 45.4},
                    {"lon": -73.5, "lat": 45.6},
                ],
            },
            {
                "role": "outer",
                "geometry": [
                    {"lon": -73.7, "lat": 45.4},
                    {"lon": -73.7, "lat": 45.6},
                    {"lon": -73.5, "lat": 45.6},
                ],
            },
            {
                "role": "inner",
                "geometry": [
                    {"lon": -73.6, "lat": 45.45},
                    {"lon": -73.6, "lat": 45.5},
                ],
            },
        ]
    }

    geometry = relation_to_geojson(relation)

    assert geometry is not None
    assert geometry["type"] == "Polygon"
    assert geometry["coordinates"][0][0] == geometry["coordinates"][0][-1]
    assert geometry_bbox(geometry) == (-73.7, 45.4, -73.5, 45.6)


def test_fallback_boundary_and_content_types_are_deterministic():
    assert fallback_circle_polygon(None, 45.5) is None

    geometry = fallback_circle_polygon(-73.6, 45.5, radius_degrees=0.01)

    assert geometry is not None
    ring = geometry["coordinates"][0]
    assert len(ring) == 25
    assert ring[0] == ring[-1]
    assert geometry_bbox(geometry) == pytest.approx((-73.61, 45.49, -73.59, 45.51))
    assert content_type_from_url("https://example.test/data.XLSX") == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert content_type_from_url("https://example.test/report.pdf") == "application/pdf"
    assert content_type_from_url("https://example.test/archive.bin") == ("application/octet-stream")
