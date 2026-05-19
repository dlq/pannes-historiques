from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "app.db"
DURABLE_NEARBY_URL = os.environ.get("DURABLE_NEARBY_URL", "")
DURABLE_HISTORY_URL = os.environ.get("DURABLE_HISTORY_URL", "") or (
    DURABLE_NEARBY_URL.replace("/nearby", "/history-nearby") if DURABLE_NEARBY_URL else ""
)
DURABLE_RUNTIME_URL = os.environ.get("DURABLE_RUNTIME_URL", "")


@dataclass(frozen=True)
class Settings:
    app_name: str = "Pannes Historiques"
    app_repo_url: str = os.environ.get(
        "APP_REPO_URL",
        "https://github.com/dlq/pannes-historiques",
    )
    host: str = os.environ.get("APP_HOST", "127.0.0.1")
    port: int = int(os.environ.get("APP_PORT", "8000"))
    base_dir: Path = BASE_DIR
    data_dir: Path = DATA_DIR
    raw_dir: Path = RAW_DIR
    db_path: Path = DB_PATH
    nominatim_url: str = os.environ.get(
        "NOMINATIM_URL",
        "https://nominatim.openstreetmap.org/search",
    )
    nominatim_user_agent: str = os.environ.get(
        "NOMINATIM_USER_AGENT",
        "pannes-historiques/0.1 (+https://github.com/dlq/pannes-historiques)",
    )
    auto_refresh_on_search: bool = os.environ.get("AUTO_REFRESH_ON_SEARCH", "1") == "1"
    durable_nearby_url: str = DURABLE_NEARBY_URL
    durable_history_url: str = DURABLE_HISTORY_URL
    durable_runtime_url: str = DURABLE_RUNTIME_URL
    refresh_max_age_minutes: int = int(os.environ.get("REFRESH_MAX_AGE_MINUTES", "30"))
    default_radius_m: int = int(os.environ.get("DEFAULT_RADIUS_M", "5000"))
    default_days: int = int(os.environ.get("DEFAULT_DAYS", "1825"))


def ensure_directories(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.raw_dir.mkdir(parents=True, exist_ok=True)
