"""Assay: the guardrail prover for AI agent definitions.

Programmatic use goes through :mod:`assay_api.sdk`::

    from assay_api import sdk
    sdk.lint_agent(text, filename="AGENTS.md")
    sdk.run_exam(text, "AGENTS.md", k=1)

The submodule is imported lazily so ``import assay_api`` stays cheap for the
HTTP app and the CLI.
"""

from __future__ import annotations

import importlib
from typing import Any

__all__ = ["__version__", "sdk"]

__version__ = "0.1.0"


def __getattr__(name: str) -> Any:
    if name == "sdk":
        # importlib (not `from . import sdk`) so the from-list machinery does
        # not re-enter this hook before the submodule is bound.
        return importlib.import_module(".sdk", __name__)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
