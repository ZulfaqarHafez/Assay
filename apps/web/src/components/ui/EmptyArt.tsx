import * as React from "react";

/**
 * "Clinical Quiet" empty-state spot illustrations: single ink specimens with one
 * dusty-plum accent. Ink uses currentColor (set a muted tone on the wrapper) so
 * they adapt to light/dark; the plum accent is fixed and reads on both.
 */

const PLUM = "#9a6f8c"; // mid plum that holds on bone and ink backgrounds

type ArtProps = { size?: number; className?: string };

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 120 120",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true as const
});

/** A dial gauge with the needle at rest — "no measurements yet". Echoes the
 * hero verdict meter, so the empty Experiments table reads as an instrument
 * waiting for its first reading. */
export function GaugeArt({ size = 96, className }: ArtProps) {
  const cx = 60;
  const cy = 82;
  const r = 40;
  // Top semicircle: angle pi (left) -> 0 (right), y measured up from the centre.
  const pt = (a: number, rr: number): [number, number] => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  const arc = Array.from({ length: 33 }, (_, i) => pt(Math.PI - (i / 32) * Math.PI, r));
  const arcD = "M " + arc.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
  const ticks = Array.from({ length: 9 }, (_, i) => Math.PI - (i / 8) * Math.PI);
  const [nx, ny] = pt(Math.PI * (162 / 180), r - 9); // needle resting at the low end
  return (
    <svg {...baseProps(size, className)}>
      <path d={arcD} />
      {ticks.map((a, i) => {
        const [ox, oy] = pt(a, r);
        const [ix, iy] = pt(a, r - (i % 2 ? 5 : 9));
        return <line key={i} x1={ox} y1={oy} x2={ix} y2={iy} opacity={i % 2 ? 0.5 : 0.8} />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} strokeWidth={2.6} />
      <circle cx={cx} cy={cy} r={4.2} fill={PLUM} stroke="none" />
      <path d={`M26 ${cy + 16} H94`} opacity={0.4} />
      <path d={`M30 ${cy + 16} V ${cy + 20} M90 ${cy + 16} V ${cy + 20}`} opacity={0.4} />
    </svg>
  );
}

/** Empty assay vial with a single plum droplet — "no experiments yet". */
export function VialArt({ size = 96, className }: ArtProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* droplet */}
      <path d="M60 16 C56 22 56 26 60 28 C64 26 64 22 60 16 Z" fill={PLUM} stroke="none" />
      {/* lip + neck */}
      <path d="M44 35 H76" opacity={0.85} />
      <path d="M48 35 V41" />
      <path d="M72 35 V41" />
      {/* tube */}
      <path d="M48 41 V92 Q48 104 60 104 Q72 104 72 92 V41" />
      {/* measurement ticks */}
      <path d="M40 56 H45" opacity={0.55} />
      <path d="M38 67 H45" opacity={0.7} />
      <path d="M40 78 H45" opacity={0.55} />
      <path d="M38 89 H45" opacity={0.7} />
      {/* faint meniscus line near the bottom */}
      <path d="M50 95 H70" opacity={0.35} stroke={PLUM} />
    </svg>
  );
}

/** A plate of probe wells, two active — "no suites yet". */
export function ProbeArrayArt({ size = 96, className }: ArtProps) {
  const cols = [33, 53, 73, 93];
  const rows = [46, 66, 86];
  const active = new Set(["53-46", "73-66"]);
  return (
    <svg {...baseProps(size, className)}>
      <rect x={18} y={30} width={84} height={74} rx={10} />
      {/* corner reference tick */}
      <path d="M24 36 H30 M24 36 V42" opacity={0.5} />
      {rows.map((y) =>
        cols.map((x) => {
          const on = active.has(`${x}-${y}`);
          return (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={5.2}
              fill={on ? PLUM : "none"}
              stroke={on ? "none" : "currentColor"}
              opacity={on ? 1 : 0.75}
            />
          );
        })
      )}
    </svg>
  );
}

/** A minimal agent specimen on a baseline — "no agents yet". */
export function AgentArt({ size = 96, className }: ArtProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* antenna + plum status node */}
      <path d="M60 34 V24" />
      <circle cx={60} cy={20} r={3.4} fill={PLUM} stroke="none" />
      {/* head */}
      <rect x={40} y={34} width={40} height={40} rx={12} />
      {/* eyes */}
      <circle cx={52} cy={54} r={2.6} fill="currentColor" stroke="none" />
      <circle cx={68} cy={54} r={2.6} fill="currentColor" stroke="none" />
      {/* shoulders */}
      <path d="M48 74 Q44 82 44 88" opacity={0.7} />
      <path d="M72 74 Q76 82 76 88" opacity={0.7} />
      {/* baseline plinth */}
      <path d="M34 96 H86" opacity={0.4} />
    </svg>
  );
}
