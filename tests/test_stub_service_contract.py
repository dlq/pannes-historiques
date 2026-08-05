"""Both service fakes must satisfy the surface web.py actually calls.

There are two independent fakes -- StubService in conftest.py for pytest and
E2EStubService in e2e_fixture_app.py for Playwright. Adding a method to one and
forgetting the other is invisible until the *other* suite runs, which is exactly
how `published_context_available` reached CI: pytest passed locally while the
browser suite failed with AttributeError. Pre-commit runs linters only, so
nothing local caught it.

Rather than force the two fakes to share fixture data (they legitimately differ),
this pins the contract: whatever web.py calls on the service, both fakes must
expose.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _service_methods_called_by_web() -> set[str]:
    source = (REPO_ROOT / "app" / "web.py").read_text(encoding="utf-8")
    return set(re.findall(r"\bservice\.([a-z_][a-z0-9_]*)\s*\(", source))


def _class_methods(path: Path, class_name: str) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                item.name
                for item in node.body
                if isinstance(item, ast.FunctionDef | ast.AsyncFunctionDef)
            }
    raise AssertionError(f"{class_name} not found in {path}")


def test_web_only_calls_methods_the_real_service_provides():
    from app.services import AppService

    called = _service_methods_called_by_web()
    assert called, "expected to find service.* calls in web.py"
    missing = sorted(name for name in called if not hasattr(AppService, name))
    assert not missing, (
        f"web.py calls methods the real service does not define: {missing}. "
        "These would fail at runtime in production."
    )


def test_both_service_fakes_cover_the_web_surface():
    called = _service_methods_called_by_web()
    fakes = {
        "StubService (tests/conftest.py)": _class_methods(
            REPO_ROOT / "tests" / "conftest.py", "StubService"
        ),
        "E2EStubService (tests/e2e_fixture_app.py)": _class_methods(
            REPO_ROOT / "tests" / "e2e_fixture_app.py", "E2EStubService"
        ),
    }
    problems = []
    for label, methods in fakes.items():
        missing = sorted(called - methods)
        if missing:
            problems.append(f"{label} is missing {missing}")
    assert not problems, (
        "; ".join(problems)
        + ". Both fakes must implement every method web.py calls, or routes fail "
        "at runtime in whichever suite uses that fake."
    )


def test_the_two_fakes_expose_the_same_service_surface():
    """Guard against the fakes drifting apart on shared methods."""
    stub = _class_methods(REPO_ROOT / "tests" / "conftest.py", "StubService")
    e2e = _class_methods(REPO_ROOT / "tests" / "e2e_fixture_app.py", "E2EStubService")
    # Each fake keeps a small number of harness-only helpers.
    stub_only_allowed = {"build", "__init__"}
    e2e_only_allowed = {"suggest", "__init__"}
    stub_only = sorted(stub - e2e - stub_only_allowed)
    e2e_only = sorted(e2e - stub - e2e_only_allowed)
    assert not stub_only and not e2e_only, (
        f"the service fakes have drifted: only in StubService {stub_only}, "
        f"only in E2EStubService {e2e_only}. Add the method to both, or add it "
        "to the harness-only allow-list in this test if it is genuinely "
        "specific to one suite."
    )
