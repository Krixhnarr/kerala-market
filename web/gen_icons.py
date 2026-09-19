"""Generate the app icon set for the Kerala Market PWA.

Run once (icons are committed, not regenerated at build time):
    ../.venv/Scripts/python gen_icons.py
Draws three ascending price bars (white, white, kasavu gold) on a Kerala-green tile -
legible down to a 16px favicon, and reads as "market prices" at a glance.
Outputs icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
(180), favicon-32/16.png and favicon.ico into web/icons/.
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

GREEN = (30, 138, 82, 255)     # --s1 Kerala palm green
GOLD = (212, 160, 23, 255)     # kasavu gold (brightened for legibility on green)
WHITE = (255, 255, 255, 255)

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)


def draw_mark(size: int, pad_frac: float, maskable: bool = False) -> Image.Image:
    """A rounded-square (or full-bleed, for maskable) blue tile with three
    ascending white/orange price bars - legible even at favicon size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size, size], fill=GREEN)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=GREEN)

    # Three bars of increasing height, centered as a group, sitting on a shared
    # baseline. The safe area is smaller for maskable icons (they get cropped
    # to a circle by the OS), so keep the glyph well inside a 40%-margin box.
    margin = 0.30 if maskable else 0.22
    box = size * (1 - 2 * margin)
    base_y = size - size * margin
    bar_w = box / 5.2       # 3 bars + 2 gaps, gap ~= 0.6 * bar_w
    gap = bar_w * 0.7
    heights = [box * 0.42, box * 0.68, box * 1.0]
    colors = [WHITE, WHITE, GOLD]
    total_w = bar_w * 3 + gap * 2
    x = (size - total_w) / 2
    radius = bar_w * 0.28
    for h, color in zip(heights, colors):
        d.rounded_rectangle([x, base_y - h, x + bar_w, base_y], radius=radius, fill=color)
        x += bar_w + gap

    return img


def main() -> None:
    draw_mark(512, 0).save(os.path.join(OUT, "icon-512.png"))
    draw_mark(192, 0).save(os.path.join(OUT, "icon-192.png"))
    draw_mark(512, 0, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    draw_mark(180, 0).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
    fav32 = draw_mark(32, 0)
    fav32.save(os.path.join(OUT, "favicon-32.png"))
    draw_mark(16, 0).save(os.path.join(OUT, "favicon-16.png"))
    Image.open(os.path.join(OUT, "icon-512.png")).save(
        os.path.join(OUT, "..", "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("wrote", os.listdir(OUT), "and favicon.ico")


if __name__ == "__main__":
    main()
