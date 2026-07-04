# Icon Sprite Contract

The old pixel-art sprite sheets under `apps/web/public/sprites/` have been
retired. Current UI call sites still use the `Sprite` component API, but
`apps/web/src/components/ui/Sprite.tsx` maps each legacy sprite name to a
Lucide icon plus a semantic tone.

## Current Rules

- Do not add `/public/sprites` references unless a new sprite-sheet workflow is
  intentionally reintroduced.
- Keep using `Sprite` for existing report, trace, diagnostic, and empty-state
  affordances so call sites stay compact.
- The optional `sheet` prop is compatibility-only and does not affect rendering.
- New names should be added to the `ICONS` map with a clear semantic tone:
  `accent`, `pass`, `warn`, `fail`, or `muted`.

## Verified Assets

Runtime bitmap assets now live in:

- `apps/web/public/brand/`
- `apps/web/public/art/`
- `docs/images/`

The production build does not require any sprite-sheet files.
