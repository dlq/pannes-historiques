from pathlib import Path

from scripts.check_module_boundaries import check_module_boundaries


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_accepts_existing_runtime_boundaries(tmp_path: Path) -> None:
    write(tmp_path / "app" / "web.py", "from .services import AppService\n")
    write(tmp_path / "app" / "services.py", "import json\n")
    write(tmp_path / "app" / "static" / "app.js", 'import { thing } from "./thing.js?v=1";\n')
    write(tmp_path / "app" / "static" / "thing.js", "export const thing = 1;\n")
    write(tmp_path / "src" / "worker.js", 'import { route } from "./worker-routing.js";\n')
    write(tmp_path / "src" / "worker-routing.js", "export const route = 'container';\n")
    write(tmp_path / "tests" / "test_web.py", "from app.web import create_app\n")
    write(
        tmp_path / "scripts" / "maintenance" / "tool.mjs",
        'import { route } from "../../src/worker-routing.js";\n',
    )

    assert check_module_boundaries(tmp_path) == []


def test_rejects_production_imports_across_runtime_boundaries(tmp_path: Path) -> None:
    write(tmp_path / "app" / "web.py", "from scripts.check_module_boundaries import main\n")
    write(tmp_path / "app" / "static" / "app.js", 'import { route } from "../../src/worker.js";\n')
    write(tmp_path / "src" / "worker.js", 'import "../../app/static/app.js";\n')

    violations = check_module_boundaries(tmp_path)

    assert [
        (
            violation.path.as_posix(),
            violation.import_target,
            violation.message,
        )
        for violation in violations
    ] == [
        (
            "app/static/app.js",
            "../../src/worker.js",
            "browser modules under app/static/ may only import other app/static/ modules",
        ),
        (
            "app/web.py",
            "scripts.check_module_boundaries",
            "app/ runtime modules must not import from scripts/",
        ),
        (
            "src/worker.js",
            "../../app/static/app.js",
            "worker modules under src/ may only import other src/ modules",
        ),
    ]
