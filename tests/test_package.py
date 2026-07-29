from app import create_app
from app.config import Settings


def test_package_factory_delegates_to_flask_app_factory(tmp_path):
    settings = Settings(
        base_dir=tmp_path,
        data_dir=tmp_path / "data",
        raw_dir=tmp_path / "data" / "raw",
        db_path=tmp_path / "data" / "app.db",
    )

    app = create_app(settings)

    assert app.name == "app.web"
