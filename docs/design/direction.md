# Assay Design Direction — "Lab Instrument"

*The chosen direction (2026-07-03): keep the warm-paper / ink / plum identity and execute
it like a precision scientific instrument. Assay is a lab test — the UI should feel like a
beautifully printed lab report crossed with measurement equipment, not a SaaS dashboard.*

## Why this direction

- It's **the brand**: assay = laboratory analysis; litmus = the meter; verdict = the stamp.
- It's **distinctive**: nobody in the agent-eval space looks like this (they all ship
  dark-Linear clones — the single most AI-generated-looking aesthetic of the moment).
- The palette already exists and is good (warm bone `#f4ead6`, deep ink `#1c212e`,
  dusty plum `#7c5470`). What's missing is the **craft layer**.

## The reference shelf (shipped products)

| Reference | What we take |
|---|---|
| Stripe Press | print typography on warm paper; hairline rules; restraint |
| Anthropic docs/brand | ink-on-paper legibility; serious but warm |
| Linear | interaction crispness: focus states, keyboard hints, motion discipline |
| Braun/Rams instruments | tick marks, mono numerals, one accent, no decoration |

## The rules (what kills the "AI-generated" look)

1. **Data is monospace.** Every number, ID, score, threshold, and unit renders in
   IBM Plex Mono with `tabular-nums`. Labels above data are 10.5px uppercase
   letterspaced mono (`.mono-label`). Prose stays Inter.
2. **Hairlines over cards.** Prefer 1px rules and flat panels over floating
   rounded cards. Shadows are tight and rare, not 55px halos.
3. **Tight radii.** 3/5/8px (was 6/8/12). Instruments are precise; pills survive
   only for status chips.
4. **The verdict is a stamp.** Uppercase, tracked, 2px border in the status color —
   like a rubber stamp on a lab report. It is the single loudest element on the page.
5. **Sections are numbered** like a report: `01 · Verdict`, `02 · What to fix`,
   `03 · By capability`. Mono, muted, quiet.
6. **One accent.** Plum appears only on interactive elements and the brand moments.
   Status colors (grass/gold/coral) appear only when they carry meaning.
7. **Meters look like instruments.** Tick marks, mono scale labels, a thin track —
   not a glowing gradient pill.
8. **Paper grain, barely.** A ~2% noise texture on the light background so it reads
   as paper, not as a hex value. Never on dark.
9. **No gradient-clipped text.** The score is solid ink, mono, huge (fixes P3-1).
10. **Motion is mechanical.** Short (120–200ms), eased, purposeful — a needle
    settling, not a bounce.

## Token deltas

- `--font-mono`: IBM Plex Mono (next/font), new.
- `--radius-sm/md/lg`: 6/8/12 → 3/5/8.
- `--shadow-card`: 0 18px 55px → 0 2px 8px + hairline border does the separation.
- New utilities: `.mono-label`, `.data`, `.stamp[.ship|.risky|.hold]`,
  `.hairline-top/-bottom`, `.section-no`, `.rule-row` (dotted leader).

## Asset plan (per prior feedback: use real design tools, never hand-drawn SVG)

- OG image + README hero: `canvas-design` skill (poster-grade PNG, this palette).
- Favicon/brandmark: keep the existing Canva-generated mark.
- Pixel sprites (ReviewCouncil): keep — at small scale they read as instrument
  glyphs and are already a signature; do not multiply them.

## Sequencing

1. Foundation: mono font + token deltas + craft utilities.
2. Verdict screen (the money shot): stamp, mono data, numbered sections, instrument meter.
3. Intake (first impression): specimen-form framing, mono detected facts.
4. Run detail: metric grid → instrument readout; checks → mono chips.
5. Assets: OG/README hero via canvas-design.
6. Before/after screenshots; contrast checks; tests/build.
