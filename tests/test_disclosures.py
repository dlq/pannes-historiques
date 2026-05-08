from app.disclosures import normalize_datetime, normalize_key, normalize_row_keys


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
