# -*- coding: utf-8 -*-
"""Assay OG image — 'Specimen Truth' (Lab Instrument) — 1200x630.

Rendered at 2x and downsampled for print-crisp hairlines. Every mark is a
measurement: ticks count, leaders walk values home, one stamp decides.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import os

S = 2  # supersample
W, H = 1200 * S, 630 * S

# Directory containing InstrumentSerif-{Regular,Italic}.ttf and
# IBMPlexMono-{Regular,Bold}.ttf (both on Google Fonts, OFL).
FONTS = os.environ.get("ASSAY_DESIGN_FONTS", os.path.join(os.path.dirname(__file__), "fonts"))

INK    = (28, 33, 46)      # #1c212e
PAPER  = (244, 234, 214)   # #f4ead6
PLUM   = (124, 84, 112)    # #7c5470
GRASS  = (31, 122, 82)     # #1f7a52
GOLD   = (162, 94, 16)     # #a25e10
CORAL  = (192, 57, 43)     # #c0392b
MUTED  = (91, 87, 78)      # #5b574e

def ink(a):   return INK + (a,)
def col(c,a): return c + (a,)

def F(name, px):
    return ImageFont.truetype(os.path.join(FONTS, name), int(px * S))

serif    = lambda px: F("InstrumentSerif-Regular.ttf", px)
serif_it = lambda px: F("InstrumentSerif-Italic.ttf", px)
mono     = lambda px: F("IBMPlexMono-Regular.ttf", px)
mono_b   = lambda px: F("IBMPlexMono-Bold.ttf", px)

img = Image.new("RGBA", (W, H), PAPER + (255,))
d = ImageDraw.Draw(img)

MX = 64 * S           # side margins
RIGHT = W - MX

def tracked(draw, xy, text, font, fill, tracking=0.0, anchor_baseline=False):
    """Letterspaced text; tracking in px (at 1x). Returns end x."""
    x, y = xy
    t = tracking * S
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        w = draw.textlength(ch, font=font)
        x += w + t
    return x

def text_w_tracked(draw, text, font, tracking=0.0):
    t = tracking * S
    return sum(draw.textlength(c, font=font) for c in text) + t * max(0, len(text) - 1)

# ---------------------------------------------------------------- top bar
top_y = 54 * S
# wordmark: plum specimen square + ASSAY
sq = 9 * S
d.rectangle([MX, top_y + 3 * S, MX + sq, top_y + 3 * S + sq], fill=col(PLUM, 255))
x = tracked(d, (MX + sq + 10 * S, top_y - 2 * S), "ASSAY", mono_b(14), ink(255), tracking=4.5)
# separator + descriptor
d.line([x + 14 * S, top_y + 7 * S, x + 14 * S + 22 * S, top_y + 7 * S], fill=ink(90), width=S)
tracked(d, (x + 44 * S, top_y + 1 * S), "PRE-DEPLOYMENT LITMUS TEST", mono(10.5), col(MUTED, 255), tracking=2.6)
# right meta
meta = "SPECIMEN: agent.md " + "·" + " FORM A-01"
mw = text_w_tracked(d, meta, mono(10.5), 1.6)
tracked(d, (RIGHT - mw, top_y + 1 * S), meta, mono(10.5), col(MUTED, 255), tracking=1.6)
# hairline
d.line([MX, 92 * S, RIGHT, 92 * S], fill=ink(70), width=S)

# ---------------------------------------------------------------- headline
hy = 136 * S
h1 = serif(88)
h1_mono = F("IBMPlexMono-Regular.ttf", 60)  # the specimen chip voice
seg1 = "Bring your "
x = MX
d.text((x, hy), seg1, font=h1, fill=ink(255))
x += d.textlength(seg1, font=h1)
# agent.md in mono, baselines locked: serif baseline = hy + serif ascent.
serif_asc = h1.getmetrics()[0]
mono_asc = h1_mono.getmetrics()[0]
baseline = hy + serif_asc
mono_y = baseline - mono_asc
# chip hugs the mono glyph box (ink bounds), padded evenly
bbox = d.textbbox((0, 0), chip_text := "agent.md", font=h1_mono)
glyph_top, glyph_bot = bbox[1], bbox[3]
ctw = d.textlength(chip_text, font=h1_mono)
pad_x, pad_y = 12 * S, 9 * S
chip_top = mono_y + glyph_top - pad_y
chip_bot = mono_y + glyph_bot + pad_y
d.rounded_rectangle([x, chip_top, x + ctw + pad_x * 2, chip_bot],
                    radius=4 * S, outline=ink(90), width=S, fill=col((255, 253, 247), 170))
d.text((x + pad_x, mono_y), chip_text, font=h1_mono, fill=col(PLUM, 255))
x += ctw + pad_x * 2 + 2 * S
d.text((x, hy), ".", font=h1, fill=ink(255))

# subhead
d.text((MX, 258 * S), "Find out where it breaks — before you ship.",
       font=serif_it(30), fill=col(MUTED, 255))

# ---------------------------------------------------------------- instrument scale (lower left)
sx0, sx1 = MX, 700 * S
sy = 442 * S
label_y = sy - 54 * S
tracked(d, (MX, label_y), "CAPABILITY · HELD-OUT VARIANTS", mono(10.5), col(MUTED, 255), tracking=2.2)
d.line([MX, label_y + 20 * S, sx1, label_y + 20 * S], fill=ink(40), width=S)

# zone band (thin, above the axis): hold / risky / ship
def zx(v):  # value 0..100 -> x
    return sx0 + (sx1 - sx0) * v / 100.0
band_y = sy - 3 * S  # snug against the axis, like printed zone ink
for v0, v1, c in [(0, 55, CORAL), (55, 80, GOLD), (80, 100, GRASS)]:
    d.line([zx(v0) + (S if v0 else 0), band_y, zx(v1) - S, band_y], fill=col(c, 160), width=2 * S)

# axis + ticks
d.line([sx0, sy, sx1, sy], fill=ink(200), width=S)
for v in range(0, 101, 2):
    xx = zx(v)
    if v % 10 == 0:
        d.line([xx, sy, xx, sy + 10 * S], fill=ink(170), width=S)
    else:
        d.line([xx, sy, xx, sy + 5 * S], fill=ink(80), width=S)
for v in (0, 25, 50, 75, 100):
    t = str(v)
    tw = d.textlength(t, font=mono(10))
    d.text((zx(v) - tw / 2, sy + 15 * S), t, font=mono(10), fill=col(MUTED, 255))

# zone words under numerals
for v, word, c in [(27, "HOLD", CORAL), (67, "RISKY", GOLD), (90, "SHIP", GRASS)]:
    wpx = text_w_tracked(d, word, mono(9.5), 2.0)
    tracked(d, (zx(v) - wpx / 2, sy + 33 * S), word, mono(9.5), col(c, 235), tracking=2.0)

# needle at 86 with reading
nv = 86
nx = zx(nv)
d.line([nx, sy - 26 * S, nx, sy + 10 * S], fill=ink(255), width=3 * S)
reading = str(nv)
rw = d.textlength(reading, font=mono_b(22))
d.text((nx - rw / 2, sy - 56 * S), reading, font=mono_b(22), fill=ink(255))

# ---------------------------------------------------------------- readings table (lower right)
tx0, tx1 = 780 * S, RIGHT
ty = 384 * S
tracked(d, (tx0, ty), "READINGS · PASS^3", mono(10.5), col(MUTED, 255), tracking=2.2)
d.line([tx0, ty + 20 * S, tx1, ty + 20 * S], fill=ink(40), width=S)

rows = [
    ("COMPLIANCE",     "0.92", "PASS", GRASS),
    ("INJECTION",      "0.88", "PASS", GRASS),
    ("CONFIDENTIALITY","0.91", "PASS", GRASS),
    ("REFUSAL",        "0.84", "PASS", GRASS),
    ("TRANSFER GAP",   "0.06", "OK",   MUTED),
]
fm, fv = mono(11.5), mono(11.5)
row_h = 27 * S
ry = ty + 34 * S
status_w = max(text_w_tracked(d, r[2], fm, 1.2) for r in rows)
for name, val, status, c in rows:
    d.text((tx0, ry), name, font=fm, fill=ink(235))
    vw = d.textlength(val, font=fv)
    sw = text_w_tracked(d, status, fm, 1.2)
    val_x = tx1 - status_w - 26 * S - vw
    # dotted leader, drawn (not typed) so it lands exactly
    lead_x = tx0 + d.textlength(name, font=fm) + 12 * S
    lead_end = val_x - 12 * S
    dot_y = ry + 8 * S
    xx = lead_x
    while xx < lead_end:
        d.ellipse([xx, dot_y, xx + 1.6 * S, dot_y + 1.6 * S], fill=ink(70))
        xx += 7 * S
    d.text((val_x, ry), val, font=fv, fill=ink(255))
    tracked(d, (tx1 - sw, ry), status, fm, col(c, 255), tracking=1.2)
    ry += row_h
d.line([tx0, ry + 4 * S, tx1, ry + 4 * S], fill=ink(40), width=S)

# ---------------------------------------------------------------- footer
fy = 588 * S
d.line([MX, fy - 14 * S, RIGHT, fy - 14 * S], fill=ink(70), width=S)
tracked(d, (MX, fy), "NO SDK · NO DATASET · NO TRACING TO WIRE", mono(10), col(MUTED, 255), tracking=2.0)
f2 = "EVERY RUN IS EVIDENCE"
f2w = text_w_tracked(d, f2, mono(10), 2.0)
tracked(d, (RIGHT - f2w, fy), f2, mono(10), col(MUTED, 255), tracking=2.0)

# ---------------------------------------------------------------- the SHIP stamp
stamp_w, stamp_h = 208 * S, 84 * S
stamp = Image.new("RGBA", (stamp_w, stamp_h), (0, 0, 0, 0))
sd = ImageDraw.Draw(stamp)
m = 4 * S
sd.rounded_rectangle([m, m, stamp_w - m, stamp_h - m], radius=6 * S, outline=col(GRASS, 255), width=3 * S)
sd.rounded_rectangle([m + 6 * S, m + 6 * S, stamp_w - m - 6 * S, stamp_h - m - 6 * S],
                     radius=4 * S, outline=col(GRASS, 210), width=S)
word = "SHIP"
fw = mono_b(30)
ww = text_w_tracked(sd, word, fw, 9.0)
tracked(sd, ((stamp_w - ww) / 2, (stamp_h - 40 * S) / 2 - 4 * S), word, fw, col(GRASS, 255), tracking=9.0)
sub = "PASS^3 · HELD"
sbw = text_w_tracked(sd, sub, mono(8.5), 1.8)
tracked(sd, ((stamp_w - sbw) / 2, stamp_h - 24 * S), sub, mono(8.5), col(GRASS, 225), tracking=1.8)
# pressed-ink texture: erode the alpha with noise so the stamp looks hand-pressed
# (kept legible: gentler dropouts than a first proof pull)
rng = np.random.default_rng(7)
noise = rng.random((stamp_h, stamp_w))
alpha = np.array(stamp.getchannel("A"), dtype=np.float32)
alpha *= 0.74 + 0.26 * (noise > 0.10)          # sparse dropouts
alpha *= 0.86 + 0.14 * rng.random((stamp_h, stamp_w))  # overall unevenness
stamp.putalpha(Image.fromarray(alpha.astype(np.uint8)))
stamp = stamp.rotate(-7, expand=True, resample=Image.BICUBIC)
# a real stamp overlaps the form — the big word lands over the leader dots,
# never over a value or a verdict column, and stays fully on the sheet.
img.alpha_composite(stamp, (int(872 * S), int(462 * S)))

# ---------------------------------------------------------------- registration marks
# tiny print-shop crosshairs in the corners — the quiet tell of a proofed sheet
def crosshair(cx, cy, r=7):
    r *= S
    d.line([cx - r, cy, cx + r, cy], fill=ink(60), width=S)
    d.line([cx, cy - r, cx, cy + r], fill=ink(60), width=S)
    d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45], outline=ink(60), width=S)
for cx, cy in [(30 * S, 30 * S), (W - 30 * S, 30 * S), (30 * S, H - 30 * S), (W - 30 * S, H - 30 * S)]:
    crosshair(cx, cy)

# ---------------------------------------------------------------- paper grain
g = rng.random((H // 2, W // 2))
grain = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.NEAREST)
grain_ink = Image.new("RGBA", (W, H), INK + (0,))
grain_ink.putalpha(grain.point(lambda p: 10 if p > 178 else 0))
img.alpha_composite(grain_ink)
# soft fiber mottle
mot = rng.random((H // 24, W // 24))
mottle = Image.fromarray((mot * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6 * S))
mo = Image.new("RGBA", (W, H), (255, 255, 255, 0))
mo.putalpha(mottle.point(lambda p: 6 if p > 150 else 0))
img.alpha_composite(mo)

# ---------------------------------------------------------------- output
out = img.convert("RGB").resize((1200, 630), Image.LANCZOS)
out_path = os.environ.get("ASSAY_OG_OUT", "assay-og.png")
out.save(out_path, "PNG")
print("saved", out_path)
