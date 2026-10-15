"""Shareable verdict card for a run — a richer proof artifact than the badge.

Where ``badge.py`` renders a one-line shields-style badge, this renders a full
640x360 "lab report" card in the Lab Instrument language (warm paper, ink, one
plum accent, a pressed verdict stamp, mono readouts). It is public like the
badge and embeddable as an ``<img>``; the web app also rasterizes it to a PNG
the user can drop into a PR or deck.
"""
from __future__ import annotations

from xml.sax.saxutils import escape

# Band -> (stamp text, hex). Matches the app palette (grass/gold/coral).
_BAND = {
    "ship": ("SHIP", "#1f7a52"),
    "risky": ("RISKY", "#a25e10"),
    "hold": ("HOLD", "#c0392b"),
    "unverified": ("UNVERIFIED", "#7a756c"),
}
_UNKNOWN = ("PENDING", "#7a756c")

_INK = "#1c212e"
_PAPER = "#f4ead6"
_PANEL = "#fffdf7"
_LINE = "#d9ccb0"
_MUTED = "#5b574e"
_PLUM = "#7c5470"

_MONO = "ui-monospace, 'IBM Plex Mono', 'Cascadia Mono', Menlo, Consolas, monospace"
_SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif"

W, H = 640, 360


def _clip(text: str, n: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def card_svg(
    *,
    agent_name: str,
    run_id: str,
    band: str,
    score: int | None,
    pass_count: int,
    pass_total: int,
    tas: float | None,
    max_gap: float,
    top_finding: str = "",
    policy_name: str = "strict",
) -> str:
    stamp_text, accent = _BAND.get(band, _UNKNOWN)
    # The name shares the row with the stamp (top-right), so cap it to the left
    # column width; longer names truncate with an ellipsis.
    name = escape(_clip(agent_name or "Agent", 20))
    rid = escape(_clip(run_id, 24))
    finding = escape(_clip(top_finding, 58)) if top_finding else ""
    score_str = "--" if score is None else str(int(score))
    tas_str = "--" if tas is None else f"{tas:.0f}"
    passk = f"{pass_count}/{pass_total}" if pass_total else "--"

    def mono(x, y, s, px, fill, weight=400, anchor="start", spacing=0.0, opacity=1.0):
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        op = f' opacity="{opacity}"' if opacity != 1.0 else ""
        return (
            f'<text x="{x}" y="{y}" font-family="{_MONO}" font-size="{px}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{sp}{op}>{escape(str(s))}</text>'
        )

    # readouts row
    reads = [("PASS^K", passk), ("SCORE", score_str), ("TAS", tas_str), ("GAP", f"{max_gap:.2f}")]
    read_svg = []
    rx = 40
    for label, val in reads:
        read_svg.append(mono(rx, 268, label, 11, _MUTED, spacing=1.2))
        read_svg.append(mono(rx, 296, val, 26, _INK, weight=600))
        rx += 150

    # the stamp, top-right, rotated — in its own reserved column (x >= 452).
    sx, sy, sw, sh = 456, 94, 148, 62
    stamp = (
        f'<g transform="rotate(-6 {sx + sw/2} {sy + sh/2})">'
        f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="6" fill="none" '
        f'stroke="{accent}" stroke-width="3"/>'
        f'<rect x="{sx+6}" y="{sy+6}" width="{sw-12}" height="{sh-12}" rx="4" fill="none" '
        f'stroke="{accent}" stroke-width="1" opacity="0.55"/>'
        f'<text x="{sx + sw/2}" y="{sy + sh/2 + 10}" font-family="{_MONO}" font-size="28" '
        f'font-weight="600" letter-spacing="6" fill="{accent}" text-anchor="middle">{stamp_text}</text>'
        f"</g>"
    )

    # ticks under the header rule (a small instrument flourish)
    ticks = "".join(
        f'<line x1="{40 + i*11}" y1="150" x2="{40 + i*11}" y2="{156 if i % 5 else 160}" '
        f'stroke="{_INK}" stroke-width="1" opacity="{0.5 if i % 5 else 0.8}"/>'
        for i in range(28)
    )

    finding_block = (
        f'{mono(40, 214, "TOP FINDING", 11, _MUTED, spacing=1.2)}'
        f'<text x="40" y="236" font-family="{_MONO}" font-size="13" fill="{_INK}">{finding}</text>'
        if finding
        else f'{mono(40, 214, "NO BLOCKING FINDINGS", 11, _MUTED, spacing=1.2)}'
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Assay verdict {stamp_text} for {name}">
<rect width="{W}" height="{H}" rx="10" fill="{_PAPER}"/>
<rect x="6" y="6" width="{W-12}" height="{H-12}" rx="7" fill="{_PANEL}" stroke="{_LINE}" stroke-width="1"/>
<rect x="6" y="6" width="6" height="{H-12}" rx="3" fill="{accent}"/>
<!-- header -->
<rect x="40" y="40" width="10" height="10" fill="{_PLUM}"/>
{mono(60, 49, "ASSAY", 13, _INK, weight=600, spacing=3.5)}
{mono(132, 49, "PRE-DEPLOYMENT LITMUS TEST", 10.5, _MUTED, spacing=2.2)}
{mono(W-40, 49, rid, 11.5, _MUTED, anchor="end")}
<line x1="40" y1="66" x2="{W-40}" y2="66" stroke="{_INK}" stroke-width="1" opacity="0.7"/>
<!-- agent name -->
<text x="40" y="116" font-family="{_SERIF}" font-size="42" fill="{_INK}">{name}</text>
{mono(40, 138, "SPECIMEN · agent.md", 11, _MUTED, spacing=1.6)}
{ticks}
{stamp}
{finding_block}
<line x1="40" y1="248" x2="{W-40}" y2="248" stroke="{_LINE}" stroke-width="1"/>
{''.join(read_svg)}
<line x1="40" y1="316" x2="{W-40}" y2="316" stroke="{_INK}" stroke-width="1" opacity="0.7"/>
{mono(40, 336, f"{policy_name.upper()} POLICY · PASS^K HELD-OUT", 10, _MUTED, spacing=1.6)}
{mono(W-40, 336, "EVERY RUN IS EVIDENCE", 10, _MUTED, anchor="end", spacing=1.6)}
</svg>"""
