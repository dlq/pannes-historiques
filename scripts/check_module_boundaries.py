from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

PYTHON_IMPORT_BLOCKS = {
    "app": {
        "scripts": "app/ runtime modules must not import from scripts/",
        "src": "app/ runtime modules must not import from src/",
        "tests": "app/ runtime modules must not import from tests/",
    }
}
JS_IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:(?:[^'"]+?\s+from\s+)?|)\s*["']([^"']+)["']""")


@dataclass(frozen=True)
class BoundaryViolation:
    path: Path
    import_target: str
    message: str


def check_module_boundaries(root: Path | str = ".") -> list[BoundaryViolation]:
    root = Path(root)
    violations: list[BoundaryViolation] = []
    violations.extend(_check_app_python(root))
    violations.extend(_check_js_owner(root / "app" / "static", "app/static", root))
    violations.extend(_check_js_owner(root / "src", "src", root))
    return sorted(violations, key=lambda item: (item.path.as_posix(), item.import_target))


def _check_app_python(root: Path) -> list[BoundaryViolation]:
    app_root = root / "app"
    if not app_root.exists():
        return []
    violations: list[BoundaryViolation] = []
    for path in app_root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    violations.extend(_python_import_violations(root, path, alias.name))
            elif isinstance(node, ast.ImportFrom):
                target = _python_import_from_target(root, path, node)
                if target:
                    violations.extend(_python_import_violations(root, path, target))
    return violations


def _python_import_from_target(root: Path, path: Path, node: ast.ImportFrom) -> str:
    module = node.module or ""
    if node.level == 0:
        return module

    base_parts = path.relative_to(root).parent.parts
    if node.level > len(base_parts):
        return ".." * node.level + module
    package_parts = base_parts[: len(base_parts) - node.level + 1]
    return ".".join((*package_parts, *module.split("."))).strip(".")


def _python_import_violations(root: Path, path: Path, target: str) -> list[BoundaryViolation]:
    top_level = target.split(".", 1)[0]
    blocks = PYTHON_IMPORT_BLOCKS.get(path.relative_to(root).parts[0], {})
    if top_level not in blocks:
        return []
    return [
        BoundaryViolation(
            path=path.relative_to(root),
            import_target=target,
            message=blocks[top_level],
        )
    ]


def _check_js_owner(owner_root: Path, owner_label: str, root: Path) -> list[BoundaryViolation]:
    if not owner_root.exists():
        return []
    violations: list[BoundaryViolation] = []
    for path in [*owner_root.rglob("*.js"), *owner_root.rglob("*.mjs")]:
        for import_target in _js_import_targets(path):
            resolved = _resolve_relative_js_import(path, import_target)
            if resolved is None:
                continue
            if _is_inside(resolved, owner_root):
                continue
            violations.append(
                BoundaryViolation(
                    path=path.relative_to(root),
                    import_target=import_target,
                    message=f"{_js_owner_name(owner_label)} may only import other {owner_label}/ modules",
                )
            )
    return violations


def _js_import_targets(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    return [match.group(1) for match in JS_IMPORT_RE.finditer(source)]


def _resolve_relative_js_import(path: Path, import_target: str) -> Path | None:
    if not import_target.startswith((".", "/")):
        return None
    clean_target = import_target.split("?", 1)[0].split("#", 1)[0]
    return (path.parent / clean_target).resolve()


def _is_inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def _js_owner_name(owner_label: str) -> str:
    if owner_label == "app/static":
        return "browser modules under app/static/"
    return "worker modules under src/"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check repository module-boundary imports.")
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args(argv)

    violations = check_module_boundaries(args.root)
    for violation in violations:
        print(f"{violation.path}: {violation.import_target}: {violation.message}")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
