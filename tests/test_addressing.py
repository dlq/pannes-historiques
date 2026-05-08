from app.addressing import normalize_text
from app.i18n import choose_language


def test_choose_language_defaults_to_french_for_unknown_values():
    assert choose_language(None) == "fr"
    assert choose_language("de") == "fr"
    assert choose_language("en") == "en"


def test_normalize_text_expands_common_quebec_address_shorthand():
    assert normalize_text("1010 rue Sherbrooke O.") == "1010 rue sherbrooke ouest"
    assert normalize_text("1 av. du Parc, Montréal, QC") == "1 avenue du parc, montreal, quebec"
