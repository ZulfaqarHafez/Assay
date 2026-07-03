# -*- coding: utf-8 -*-
"""Assay app icon / favicon — the "A + specimen" mark in the Lab Instrument language.

Two ink strokes form an A (Assay); a plum droplet is the specimen; a hairline
crossbar with two tick notches makes it read as a measured instrument. Bold
enough to survive 16px. Rendered at 4x and downsampled.
"""
from PIL import Image, ImageDraw
import os

S = 4
D = 512 * S
# Theme: "bone" (dark mark on paper, for light UI) or "dark" (light mark on
# charcoal, for dark UI). Colors mirror the app's light/dark tokens.
THEME = os.environ.get("ASSAY_ICON_THEME", "bone")
if THEME == "dark":
    INK = (242, 234, 217, 255)     # bone strokes
    PAPER = (32, 32, 44, 255)      # charcoal tile (#20202c)
    PLUM = (195, 154, 180, 255)    # brightened mauve (#c39ab4)
    TILE_BORDER = (242, 234, 217, 26)
    TICK = (242, 234, 217, 170)
else:
    INK = (28, 33, 46, 255)
    PAPER = (244, 234, 214, 255)
    PLUM = (124, 84, 112, 255)
    TILE_BORDER = (28, 33, 46, 30)
    TICK = (28, 33, 46, 170)

img = Image.new("RGBA", (D, D), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded paper tile
pad = 24 * S
d.rounded_rectangle([pad, pad, D - pad, D - pad], radius=96 * S, fill=PAPER,
                    outline=TILE_BORDER, width=S)

def stroke(p0, p1, w):
    d.line([p0[0] * S, p0[1] * S, p1[0] * S, p1[1] * S], fill=INK, width=int(w * S))
    for p in (p0, p1):  # round caps
        r = w * S / 2
        d.ellipse([p[0]*S - r, p[1]*S - r, p[0]*S + r, p[1]*S + r], fill=INK)

apex = (256, 132)
lfoot = (150, 392)
rfoot = (362, 392)
sw = 40
stroke(lfoot, apex, sw)
stroke(rfoot, apex, sw)

# instrument crossbar: a hairline with two tick notches
bar_y = 320
d.line([176 * S, bar_y * S, 336 * S, bar_y * S], fill=INK, width=int(3 * S))
for tx in (212, 300):
    d.line([tx * S, (bar_y - 9) * S, tx * S, (bar_y + 9) * S], fill=TICK, width=int(2 * S))

# plum specimen droplet (classic tip-down), centered above the crossbar
cx, cy = 256, 244
dr = 33
# bulb (circle) low, triangular tip pointing down
d.ellipse([(cx - dr) * S, (cy - dr) * S, (cx + dr) * S, (cy + dr) * S], fill=PLUM)
d.polygon([((cx - dr + 7) * S, (cy - 4) * S), ((cx + dr - 7) * S, (cy - 4) * S), (cx * S, (cy + 40) * S)], fill=PLUM)

out = img.resize((512, 512), Image.LANCZOS)
name = os.environ.get("ASSAY_ICON_NAME", "icon.png")
root = os.environ.get("ASSAY_ICON_OUT_DIR", ".")
out.save(os.path.join(root, name), "PNG")
print("saved", name, "theme", THEME)
