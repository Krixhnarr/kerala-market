r"""Generate the native app icon set (run once; outputs are committed).

    ..\.venv\Scripts\python gen_assets.py

Same mark as the website (three ascending price bars) on the app's red, with
the tallest bar in charcoal. Also writes the Android notification glyph, which
must be white-on-transparent (Android tints it with the accent colour).
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

RED = (255, 32, 0, 255)
PAPER = (246, 246, 246, 255)
INK = (21, 21, 21, 255)
WHITE = (255, 255, 255, 255)
OUT = os.path.join(os.path.dirname(__file__), "assets")


def bars(d: ImageDraw.ImageDraw, size: int, margin: float, colors) -> None:
    box = size * (1 - 2 * margin)
    base_y = size - size * margin
    bar_w = box / 5.2
    gap = bar_w * 0.7
    heights = [box * 0.42, box * 0.68, box * 1.0]
    x = (size - (bar_w * 3 + gap * 2)) / 2
    for h, color in zip(heights, colors):
        d.rectangle([x, base_y - h, x + bar_w, base_y], fill=color)
        x += bar_w + gap


def tile(size: int, bg, margin: float, colors) -> Image.Image:
    img = Image.new("RGBA", (size, size), bg)
    bars(ImageDraw.Draw(img), size, margin, colors)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    tile(1024, RED, 0.24, [PAPER, PAPER, INK]).save(os.path.join(OUT, "icon.png"))
    # Adaptive foreground: transparent, glyph inside the 66% safe zone.
    tile(1024, (0, 0, 0, 0), 0.30, [PAPER, PAPER, INK]).save(os.path.join(OUT, "adaptive-icon.png"))
    tile(512, (0, 0, 0, 0), 0.10, [PAPER, PAPER, INK]).save(os.path.join(OUT, "splash-icon.png"))
    tile(96, (0, 0, 0, 0), 0.12, [WHITE, WHITE, WHITE]).save(os.path.join(OUT, "notification-icon.png"))
    print("wrote", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
