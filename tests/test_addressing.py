from app.addressing import normalize_address, normalize_text
from app.i18n import choose_language


def test_choose_language_defaults_to_french_for_unknown_values():
    assert choose_language(None) == "fr"
    assert choose_language("de") == "fr"
    assert choose_language("en") == "en"


def test_normalize_text_expands_common_quebec_address_shorthand():
    assert normalize_text("1010 rue Sherbrooke O.") == "1010 rue sherbrooke ouest"
    assert normalize_text("1 av. du Parc, Montréal, QC") == "1 avenue du parc, montreal, quebec"


def test_normalize_address_extracts_unit_and_postal_code_from_comma_separated_query():
    normalized = normalize_address("5220 Rue Jeanne-Mance, apt 4, Montréal, QC, H2V 4G7")

    assert normalized.street_line == "5220 rue jeanne-mance"
    assert normalized.city == "apt 4"
    assert normalized.province == "MONTREAL"
    assert normalized.postal_code == "H2V4G7"
    assert normalized.unit == "4"
