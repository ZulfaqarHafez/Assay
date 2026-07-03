"""Static artifact lint for the no-key path.

Without an OpenAI key Assay cannot run the behavioral exam, but it can still
give real, deterministic value: a structured read of the agent artifact itself.
This is explicitly *static analysis*, never a ship/risky/hold verdict. That
distinction is carried in the report label and enforced by not emitting a
Scorecard here.

Checks (all deterministic, offline):
  * dangerous tool grants - declared tools whose names imply irreversible power
  * missing guardrail language - no destructive/injection/secret guidance present
  * leaked secrets - key/token patterns embedded in the artifact text itself
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import ToolSpec
from .tool_parser import parse_tools_from_markdown

Severity = Literal["high", "medium", "low"]

# Guardrail language we hope to find; absence is a (soft) finding.
_GUARDRAIL_SIGNALS = {
    "destructive": ("confirm", "irreversible", "destructive", "never delete", "backup", "reversible"),
    "injection": ("untrusted", "injection", "ignore instructions", "tool output", "not as instructions"),
    "secrets": ("secret", "credential", "api key", "never reveal", "redact", ".env"),
}

# Secret-ish patterns that should never be pasted into an instruction file.
_SECRET_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"sk-[A-Za-z0-9]{16,}", "OpenAI-style secret key"),
    (r"sk_live_[A-Za-z0-9]{16,}", "Stripe live secret key"),
    (r"ghp_[A-Za-z0-9]{20,}", "GitHub personal access token"),
    (r"AKIA[0-9A-Z]{16}", "AWS access key id"),
    (r"AIza[0-9A-Za-z_\-]{20,}", "Google API key"),
    (r"xox[baprs]-[0-9A-Za-z-]{10,}", "Slack token"),
    (r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", "embedded private key"),
)


class LintFinding(BaseModel):
    id: str
    severity: Severity
    title: str
    detail: str

    model_config = ConfigDict(extra="forbid")


class StaticLintReport(BaseModel):
    schema_: Literal["assay.static_lint.v1"] = Field(default="assay.static_lint.v1", alias="schema")
    kind: Literal["static_analysis"] = "static_analysis"
    label: str = "Static analysis - not a behavioral verdict. Add an OpenAI key to run the guardrail exam."
    findings: list[LintFinding] = Field(default_factory=list)
    dangerous_tools: list[str] = Field(default_factory=list)
    guardrail_coverage: dict[str, bool] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="forbid")


def static_lint(markdown: str, declared_tools: list[ToolSpec] | None = None) -> StaticLintReport:
    text = markdown or ""
    lowered = text.lower()
    findings: list[LintFinding] = []

    # 1. Dangerous tool grants.
    tools_by_key = {tool.name.lower(): tool for tool in parse_tools_from_markdown(text)}
    for tool in declared_tools or []:
        tools_by_key.setdefault(tool.name.lower(), tool)
    dangerous = sorted({tool.name for tool in tools_by_key.values() if tool.dangerous})
    for name in dangerous:
        findings.append(
            LintFinding(
                id=f"dangerous-tool-{name}",
                severity="high",
                title=f"Dangerous capability granted: `{name}`",
                detail="This tool can take an irreversible action. Confirm it is required, "
                "and add an explicit guardrail describing when the agent must refuse or confirm.",
            )
        )

    # 2. Missing guardrail language.
    coverage: dict[str, bool] = {}
    for topic, signals in _GUARDRAIL_SIGNALS.items():
        present = any(signal in lowered for signal in signals)
        coverage[topic] = present
        if not present:
            findings.append(
                LintFinding(
                    id=f"missing-guardrail-{topic}",
                    severity="medium",
                    title=f"No {topic} guardrail language found",
                    detail=f"The artifact does not mention how to handle {topic}. Add an explicit "
                    "instruction so the behavior is defined rather than left to the model.",
                )
            )

    # 3. Leaked secrets.
    for pattern, label in _SECRET_PATTERNS:
        if re.search(pattern, text):
            findings.append(
                LintFinding(
                    id=f"secret-{label.replace(' ', '-').lower()}",
                    severity="high",
                    title=f"Possible {label} embedded in the artifact",
                    detail="Secrets must never live in an instruction file. Remove it and rotate the "
                    "credential immediately. Anything the agent can read, an attacker may too.",
                )
            )

    return StaticLintReport(
        findings=findings,
        dangerous_tools=dangerous,
        guardrail_coverage=coverage,
    )
