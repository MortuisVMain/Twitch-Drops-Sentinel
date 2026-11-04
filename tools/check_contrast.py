"""Fails when a text token has less than 4.5:1 contrast on the surfaces of any theme in src/index.css.

Usage: python tools/check_contrast.py [--suggest]
Light themes also check the --led-* accents, which are used as text.
Surfaces: --bg-chassis-base, --bg-island (solid layer, plus a 10% white lift for its gradient highlight), --bg-row, --bg-well.
"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "src" / "index.css"
TEXT_TOKENS = ("--text-primary", "--text-secondary", "--text-muted", "--text-engraved")
ACCENT_TOKENS = ("--led-mint", "--led-amber", "--led-cyan", "--led-rose")  # used as text; checked on light themes only
SURFACES = ("--bg-chassis-base", "--bg-island", "--bg-row", "--bg-well")
MIN_RATIO = 4.5


def parse_color(value):
    """Last colour in a CSS value as (r, g, b, a); gradients resolve to their solid base layer."""
    found = re.findall(r"#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)", value)
    if not found:
        return None
    c = found[-1]
    if c.startswith("#"):
        return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 1.0)
    nums = [float(x) for x in re.findall(r"[\d.]+", c)]
    return (nums[0], nums[1], nums[2], nums[3] if len(nums) > 3 else 1.0)


def over(fg, bg):
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def themes():
    css = CSS.read_text(encoding="utf-8")
    root = {}
    for m in re.finditer(r"\n\s*((?::root, )?\[data-theme=\"([a-z-]+)\"\])\s*\{(.*?)\n\s*\}", css, re.S):
        tokens = dict(re.findall(r"(--[a-z-]+):\s*([^;]+);", m.group(3)))
        if not root:
            root = tokens  # first block is :root (titanium): themes inherit tokens they do not override
        yield m.group(2), {**root, **tokens}


def surfaces(tokens):
    base = parse_color(tokens["--bg-chassis-base"])
    out = {}
    for name in SURFACES:
        raw = parse_color(tokens.get(name, tokens["--bg-chassis-base"]))
        solid = over(raw, base)
        out[name] = solid
        if name == "--bg-island":
            out[name + "+lift"] = over((255, 255, 255, 0.10), solid) if lum(solid) < 0.5 else over((0, 0, 0, 0.10), solid)
    return out


def suggest(color, surf, dark):
    """Smallest mix toward white (dark theme) or black (light theme) that passes on every surface."""
    target = (255, 255, 255) if dark else (0, 0, 0)
    for step in range(0, 101):
        t = step / 100
        c = tuple(color[i] * (1 - t) + target[i] * t for i in range(3)) + (1.0,)
        if all(ratio(c, s) >= MIN_RATIO + 0.1 for s in surf.values()):
            return "#%02X%02X%02X" % tuple(round(v) for v in c[:3])
    return None


def main():
    bad = 0
    for name, tokens in themes():
        surf = surfaces(tokens)
        dark = lum(surf["--bg-chassis-base"]) < 0.5
        for tok in TEXT_TOKENS + (() if dark else ACCENT_TOKENS):
            col = parse_color(tokens[tok])
            worst = min(ratio(col, s) for s in surf.values())
            ok = worst >= MIN_RATIO
            bad += not ok
            line = "%-10s %-16s %s  worst %.2f:1  %s" % (name, tok, tokens[tok].strip(), worst, "ok" if ok else "FAIL")
            if not ok and "--suggest" in sys.argv:
                line += "  -> " + str(suggest(col, surf, dark))
            print(line)
    print("contrast: %d token(s) below %.1f:1" % (bad, MIN_RATIO))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
