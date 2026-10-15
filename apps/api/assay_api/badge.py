"""Embeddable SVG status badge for a run — a shareable proof artifact.

A run's verdict is otherwise only a local JSON download; a badge is a trust
signal that travels (README, PR, dashboard). ``badge_svg`` renders a
shields.io-style SVG from the run's deployability decision, keyed to the run and
the agent.md hash so it certifies a specific definition.
"""
from __future__ import annotations

import hashlib
from xml.sax.saxutils import escape

# Band → (label text, hex color). Matches the web verdict lexicon (SHIP/RISKY/HOLD).
_BAND = {
    "ship": ("ship", "#3fa45b"),
    "probation": ("risky", "#d9a441"),
    "do_not_ship": ("hold", "#d1493f"),
    "unverified": ("unverified", "#8a8a8a"),
}
_UNKNOWN = ("pending", "#8a8a8a")


def _char_width(text: str) -> int:
    # ~6.5px per char at 11px; good enough for a self-contained badge.
    return int(len(text) * 6.5) + 12


def badge_svg(verdict: str | None, detail: str = "", agent_hash: str | None = None) -> str:
    """Render a two-cell SVG badge: left 'assay', right the verdict + optional detail."""
    label = "assay"
    value_text, color = _BAND.get(verdict or "", _UNKNOWN)
    right = value_text if not detail else f"{value_text} · {detail}"
    right = right[:40]

    left_w = _char_width(label)
    right_w = _char_width(right)
    total = left_w + right_w
    title = escape(f"assay: {right}" + (f" ({agent_hash})" if agent_hash else ""))
    label_e = escape(label)
    right_e = escape(right)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" '
        f'role="img" aria-label="{title}">'
        f"<title>{title}</title>"
        f'<linearGradient id="s" x2="0" y2="100%">'
        f'<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        f'<stop offset="1" stop-opacity=".1"/></linearGradient>'
        f'<clipPath id="r"><rect width="{total}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)">'
        f'<rect width="{left_w}" height="20" fill="#333"/>'
        f'<rect x="{left_w}" width="{right_w}" height="20" fill="{color}"/>'
        f'<rect width="{total}" height="20" fill="url(#s)"/>'
        f"</g>"
        f'<g fill="#fff" text-anchor="middle" '
        f'font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">'
        f'<text x="{left_w / 2}" y="14">{label_e}</text>'
        f'<text x="{left_w + right_w / 2}" y="14">{right_e}</text>'
        f"</g></svg>"
    )


def agent_hash(system_prompt: str | None) -> str:
    """Short stable hash of the agent definition the badge certifies."""
    return hashlib.sha256((system_prompt or "").encode("utf-8")).hexdigest()[:12]
