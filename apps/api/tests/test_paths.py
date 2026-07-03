from __future__ import annotations

from assay_api.paths import project_root


def test_project_root_resolves_source_checkout_layout(tmp_path):
    root = tmp_path / "repo"
    package = root / "apps" / "api" / "assay_api"
    package.mkdir(parents=True)

    assert project_root(package / "paths.py") == root


def test_project_root_resolves_docker_layout(tmp_path):
    root = tmp_path / "app"
    package = root / "assay_api"
    package.mkdir(parents=True)
    (root / "requirements.txt").write_text("fastapi\n", encoding="utf-8")

    assert project_root(package / "paths.py") == root
