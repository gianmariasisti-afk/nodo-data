#!/usr/bin/env python3
"""nodo pop portraits: python3 tools/pop.py photo.jpg out.png [palette]
Square crop (face-biased) -> contrast -> 3-tone map -> halftone dots -> offset colour block -> round badge."""
import sys, math
from PIL import Image, ImageOps, ImageDraw, ImageFilter, ImageEnhance
PAL = {  # (shadow, mid, light, background, accent)
 "coral": ("#121c1c", "#c8553d", "#f5dcc8", "#f4ebb8", "#2f6f6a"),
 "azure": ("#121c1c", "#1d3a5f", "#dbe9f4", "#f5dcc8", "#c8553d"),
 "mint":  ("#121c1c", "#2f6f6a", "#d7ede0", "#f4ebb8", "#c8553d"),
 "sun":   ("#121c1c", "#c8553d", "#f4ebb8", "#dbe9f4", "#1d3a5f"),
}
def hx(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def pop(src, out, pal="coral", size=512):
    s, m, l, bg, ac = map(hx, PAL[pal])
    im = Image.open(src).convert("L"); w, h = im.size; side = min(w, h)
    top = int((h - side) * 0.25)                      # bias toward the top: faces sit high
    im = im.crop(((w - side) // 2, top, (w + side) // 2, top + side)).resize((size, size), Image.LANCZOS)
    im = ImageOps.autocontrast(ImageEnhance.Contrast(im.filter(ImageFilter.GaussianBlur(1.2))).enhance(1.5), cutoff=2)
    # 3-tone map
    px = im.load(); tone = Image.new("RGB", (size, size)); tp = tone.load()
    for y in range(size):
        for x in range(size):
            v = px[x, y]; tp[x, y] = s if v < 85 else (m if v < 170 else l)
    # halftone overlay on mids
    ht = Image.new("L", (size, size), 0); d = ImageDraw.Draw(ht); step = 11
    for gy in range(0, size, step):
        for gx in range(0, size, step):
            v = px[min(gx + step // 2, size - 1), min(gy + step // 2, size - 1)]
            r = (1 - v / 255) * step * 0.62
            if r > 0.6: d.ellipse((gx + step / 2 - r, gy + step / 2 - r, gx + step / 2 + r, gy + step / 2 + r), fill=255)
    canvas = Image.new("RGB", (size, size), bg)
    cd = ImageDraw.Draw(canvas); cd.ellipse((size * .08, size * .08, size * 1.08, size * 1.08), fill=ac)   # offset colour block
    canvas.paste(tone, (0, 0), Image.eval(ht, lambda v: 0).point(lambda v: 0))  # placeholder no-op
    layer = Image.composite(tone, Image.new("RGB", (size, size), l), Image.new("L", (size, size), 255))
    dots = Image.new("RGB", (size, size), s)
    blended = Image.composite(dots, layer, ht.point(lambda v: 90 if v else 0))
    # cut-out: keep photo inside a circle, thick ink ring
    mask = Image.new("L", (size, size), 0); ImageDraw.Draw(mask).ellipse((size * .04, size * .04, size * .96, size * .96), fill=255)
    canvas.paste(blended, (0, 0), mask)
    ImageDraw.Draw(canvas).ellipse((size * .04, size * .04, size * .96, size * .96), outline=s, width=int(size * .025))
    rnd = Image.new("L", (size, size), 0); ImageDraw.Draw(rnd).ellipse((0, 0, size - 1, size - 1), fill=255)
    res = Image.new("RGBA", (size, size), (0, 0, 0, 0)); res.paste(canvas, (0, 0), rnd); res.save(out)
if __name__ == "__main__": pop(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "coral")
