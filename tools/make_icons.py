"""Regenerate Cadence icons: python3 tools/make_icons.py (needs Pillow)."""
import math, os
from PIL import Image, ImageDraw
F = '#1F5C45'; PAPER = '#F3F1EC'
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', 'icons')

def mark(size, bg, circle_frac, full_bleed=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), bg)
    d = ImageDraw.Draw(im)
    r = S * circle_frac / 2
    if full_bleed:
        d.rectangle([0, 0, S, S], fill=F)
    else:
        d.ellipse([S/2-r, S/2-r, S/2+r, S/2+r], fill=F)
    ro = r * 0.56; w = r * 0.2
    d.arc([S/2-ro, S/2-ro, S/2+ro, S/2+ro], start=40, end=320, fill=PAPER, width=int(w))
    for ang in (40, 320):  # round caps on the C
        a = math.radians(ang); rm = ro - w/2
        cx = S/2 + rm*math.cos(a); cy = S/2 + rm*math.sin(a)
        d.ellipse([cx-w/2, cy-w/2, cx+w/2, cy+w/2], fill=PAPER)
    dr = w * 0.62  # the "beat" dot inside the C
    d.ellipse([S/2+ro*0.62-dr, S/2-dr, S/2+ro*0.62+dr, S/2+dr], fill=PAPER)
    return im.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
mark(192, (0,0,0,0), 0.98).save(os.path.join(OUT, 'icon-192.png'))
mark(512, (0,0,0,0), 0.98).save(os.path.join(OUT, 'icon-512.png'))
mark(512, F, 0.62, full_bleed=True).save(os.path.join(OUT, 'icon-maskable-512.png'))   # mark inside the safe zone
mark(180, F, 0.74, full_bleed=True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))  # opaque, iOS rounds corners
mark(32, (0,0,0,0), 0.98).save(os.path.join(OUT, 'favicon-32.png'))
