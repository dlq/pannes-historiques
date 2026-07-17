import io
import zipfile

import pytest

from app.disclosures import (
    AccessResponsePageParser,
    DisclosureSource,
    clean_cell,
    column_index,
    content_type_from_url,
    discover_disclosure_sources,
    fallback_circle_polygon,
    first_value,
    geometry_bbox,
    is_outage_related_text,
    maybe_float,
    normalize_datetime,
    normalize_key,
    normalize_row_keys,
    parse_integer_tokens,
    parse_multi_year_regional_metrics,
    parse_pdf_row_line,
    parse_single_period_regional_metrics,
    parse_xlsx,
    relation_to_geojson,
    rows_to_dicts,
    sources_from_discovered_article,
)


def xlsx_fixture(files: dict[str, str]) -> bytes:
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return payload.getvalue()


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


def test_parse_xlsx_reads_inline_cells_and_sparse_data_rows():
    payload = xlsx_fixture(
        {
            "xl/workbook.xml": """
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Pannes" sheetId="1" r:id="rId1" /></sheets>
                </workbook>
            """,
            "xl/_rels/workbook.xml.rels": """
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Target="worksheets/sheet1.xml" />
                </Relationships>
            """,
            "xl/worksheets/sheet1.xml": """
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData>
                    <row r="1"><c r="A1" t="inlineStr"><is><t>Notes</t></is></c></row>
                    <row r="2">
                      <c r="A2" t="inlineStr"><is><t>Date début interruption</t></is></c>
                      <c r="B2" t="inlineStr"><is><t>Clients</t></is></c>
                      <c r="C2" t="inlineStr"><is><t>Durée (sec)</t></is></c>
                    </row>
                    <row r="3">
                      <c r="A3" t="inlineStr"><is><t>2025-01-02 03:04:05</t></is></c>
                      <c r="B3"><v>42</v></c><c r="C3"><v>7200</v></c>
                    </row>
                    <row r="4"><c r="B4"><v>7</v></c></row>
                  </sheetData>
                </worksheet>
            """,
        }
    )

    assert parse_xlsx(payload) == {
        "Pannes": [
            {
                "Date début interruption": "2025-01-02 03:04:05",
                "Clients": 42,
                "Durée (sec)": 7200,
            },
            {"Clients": 7},
        ]
    }


def test_parse_integer_tokens_handles_split_and_unexpected_metric_columns():
    assert parse_integer_tokens("1 234 56 7 890", expected_values=3) == [1234, 56, 7890]
    assert parse_integer_tokens("12 345 678") == [12345, 678]


def test_parse_xlsx_ignores_sheets_without_a_recognized_outage_header():
    payload = xlsx_fixture(
        {
            "xl/workbook.xml": """
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Metadata" sheetId="1" r:id="rId1" /></sheets>
                </workbook>
            """,
            "xl/_rels/workbook.xml.rels": """
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Target="worksheets/sheet1.xml" />
                </Relationships>
            """,
            "xl/worksheets/sheet1.xml": """
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Read me</t></is></c></row></sheetData>
                </worksheet>
            """,
        }
    )

    assert parse_xlsx(payload) == {}


def test_parse_xlsx_resolves_shared_strings():
    payload = xlsx_fixture(
        {
            "xl/sharedStrings.xml": """
                <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <si><t>Date début interruption</t></si><si><t>Clients</t></si>
                  <si><t>2025-01-02 03:04:05</t></si>
                </sst>
            """,
            "xl/workbook.xml": """
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Pannes" sheetId="1" r:id="rId1" /></sheets>
                </workbook>
            """,
            "xl/_rels/workbook.xml.rels": """
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Target="worksheets/sheet1.xml" />
                </Relationships>
            """,
            "xl/worksheets/sheet1.xml": """
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData>
                    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
                    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row>
                  </sheetData>
                </worksheet>
            """,
        }
    )

    assert parse_xlsx(payload) == {
        "Pannes": [{"Date début interruption": "2025-01-02 03:04:05", "Clients": 42}]
    }


def test_xlsx_helper_values_handle_sparse_rows_and_invalid_numbers():
    assert column_index("A1") == 0
    assert column_index("AA10") == 26
    assert clean_cell(" 42 ") == 42
    assert clean_cell("2.5") == 2.5
    assert clean_cell("not a number") == "not a number"
    assert rows_to_dicts([["Notes"], ["Clients", ""], [5, "ignored"]]) == [{"Clients": 5}]


def test_disclosure_value_helpers_prefer_present_values_and_reject_invalid_numbers():
    assert first_value({"first": "", "second": 2}, "first", "second") == 2
    assert first_value({"first": None}, "first", "missing") is None
    assert maybe_float("2.5") == 2.5
    assert maybe_float("null") is None
    assert maybe_float("invalid") is None


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


def test_discover_disclosure_sources_filters_non_outage_articles_and_http_failures(monkeypatch):
    page = """
      <article id="dai-2026-0099">
        <h2>Objet : Pannes dans la ville de Sainte-Julie</h2>
        <p>Publié sur le site Web : 2026-02-03</p>
        <a href="/data/DAI-2026-0099-document.xlsx">Document Excel</a>
      </article>
      <article id="dai-2026-0100">
        <h2>Objet : Contrats de fourniture</h2>
        <a href="/data/DAI-2026-0100-document.xlsx">Document Excel</a>
      </article>
    """.encode()
    monkeypatch.setattr("app.disclosures.fetch_bytes", lambda _url: (page, 200, "text/html"))

    sources = discover_disclosure_sources()

    assert [(source.dai_number, source.format, source.geography_label) for source in sources] == [
        ("DAI-2026-0099", "xlsx", "Sainte-Julie")
    ]

    monkeypatch.setattr("app.disclosures.fetch_bytes", lambda _url: (b"", 503, "text/html"))
    assert discover_disclosure_sources() == []


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
