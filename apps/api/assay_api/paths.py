from __future__ import annotations

from pathlib import Path


def project_root(start: Path | str | None = None) -> Path:
    """Resolve the app root in either the source checkout or Docker image."""
    current = Path(start or __file__).resolve()
    base = current if current.is_dir() else current.parent

    for parent in (base, *base.parents):
        if (parent / "apps" / "api" / "assay_api").is_dir():
            return parent
        if (parent / "assay_api").is_dir() and (parent / "requirements.txt").is_file():
            return parent

    if base.name == "assay_api":
        return base.parent
    for parent in base.parents:
        if parent.name == "assay_api":
            return parent.parent
    return base
