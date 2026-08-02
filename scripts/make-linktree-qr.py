#!/usr/bin/env python3
"""
Generate the QuickIn linktree QR code.

WHY THIS IS PERMANENT AND FREE
------------------------------
This makes a *static* QR code: the URL is encoded directly into the pattern.
Nothing is registered with any service, so there is no account, no scan quota,
no subscription, and no expiry — the image works for as long as
https://quickin-eg.com/links resolves, which is our own domain.

That is the opposite of the "dynamic"/"trackable" QR codes sold by sites like
qr-code-generator.com or bit.ly. Those encode *their* short link, which redirects
to yours. They can (and do) expire, start charging, or shut down — and when that
happens every printed sticker and business card dies with them. The trade-off is
that a static code cannot be re-pointed later: to change the destination you edit
what lives at /links, not the QR. Since /links is our own linktree page whose rows
we control, that is exactly the right trade.

USAGE
-----
    python3 scripts/make-linktree-qr.py                  # -> ~/Desktop
    python3 scripts/make-linktree-qr.py --out ~/Downloads
    python3 scripts/make-linktree-qr.py --plain          # black on white
    python3 scripts/make-linktree-qr.py --no-logo
    python3 scripts/make-linktree-qr.py --url https://quickin-eg.com/links

OUTPUT
------
    quickin-linktree-qr.svg   vector, no centre mark — for anything printed
    quickin-linktree-qr.png   raster with the centre mark — screens, social, slides

Only the PNG gets the QuickIn mark in the middle. The SVG is deliberately the
bare code: it stays pure vector, so a printer can scale it to a tote bag or a
business card with no loss, and a designer can drop the logo in themselves in
Illustrator if a print piece wants it.

Requires: segno (pure Python, no dependencies). Pillow only for the PNG logo.
    python3 -m pip install --user segno pillow
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import segno
except ImportError:
    sys.exit(
        "Missing dependency 'segno'. Install it with:\n"
        "    python3 -m pip install --user segno"
    )

# The apex domain redirects to www + locale, so this is the shortest URL that
# still lands on the page. Shorter data means a lower QR version, which means
# physically larger modules at the same print size — i.e. easier to scan.
DEFAULT_URL = "https://quickin-eg.com/links"

# QuickIn palette, matching src/app/globals.css.
BURGUNDY = "#5B0F16"
CREAM = "#F6F1E6"

BASENAME = "quickin-linktree-qr"
# Repo-relative path to the mark drawn in the middle of the PNG.
LOGO_PATH = Path(__file__).resolve().parent.parent / "public" / "logo-icon.png"


def relative_luminance(hex_color: str) -> float:
    """WCAG relative luminance, used for the contrast check below."""
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))

    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = channel(r), channel(g), channel(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg: str, bg: str) -> float:
    a, b = relative_luminance(fg), relative_luminance(bg)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def add_logo(png_path: Path, logo_path: Path, bg_hex: str) -> float:
    """Composite the QuickIn mark into the centre of the PNG.

    Safe because the code is written at error-correction level H, which can
    reconstruct ~30% of lost modules. What matters is the size of the whole
    patch (mark *plus* its padding), not the mark alone — so that is what gets
    capped, at 24% of the width, i.e. ~5.8% of the area. The padded background
    also stops the mark merging into surrounding dark modules.

    Returns the fraction of the code's area the patch covers.
    """
    try:
        from PIL import Image
    except ImportError:
        print("  ! Pillow not installed — skipping the centre logo.")
        print("    python3 -m pip install --user pillow")
        return 0.0

    if not logo_path.exists():
        print(f"  ! Logo not found at {logo_path} — skipping the centre logo.")
        return 0.0

    qr = Image.open(png_path).convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")

    # Solve for the mark size so that mark + padding lands on the 24% cap. The
    # logo is wider than it is tall, so thumbnail() fits it inside the box and
    # the real patch usually ends up smaller than the cap.
    pad_ratio = 0.14
    target = int((qr.width * 0.24) / (1 + 2 * pad_ratio))
    logo.thumbnail((target, target), Image.LANCZOS)

    # Opaque patch behind the mark so dark modules never touch it.
    pad = int(target * pad_ratio)
    patch = Image.new(
        "RGBA",
        (logo.width + pad * 2, logo.height + pad * 2),
        bg_hex,
    )
    patch.paste(logo, (pad, pad), logo)

    qr.alpha_composite(
        patch,
        ((qr.width - patch.width) // 2, (qr.height - patch.height) // 2),
    )
    qr.convert("RGB").save(png_path)
    return (patch.width * patch.height) / (qr.width * qr.height)


def verify(png_path: Path, expected: str) -> str:
    """Decode the PNG we just wrote and check it says what we meant.

    Run twice: once full-size, once downscaled to 300px — roughly a 2.5 cm
    print. The small render is the one that matters, because that is where a
    centre logo or too-fine modules actually start costing scans. Optional:
    without OpenCV installed we simply say so rather than claiming success.
    """
    try:
        import cv2
    except ImportError:
        return "skipped (pip install --user opencv-python-headless to enable)"

    img = cv2.imread(str(png_path))
    if img is None:
        return "FAILED — could not read the PNG back"

    detector = cv2.QRCodeDetector()
    full, _, _ = detector.detectAndDecode(img)
    if full != expected:
        return f"FAILED at full size — decoded {full!r}"

    small = cv2.resize(img, (300, 300), interpolation=cv2.INTER_AREA)
    tiny, _, _ = detector.detectAndDecode(small)
    if tiny != expected:
        return "FAILED at 300px — fine at full size, but too dense for small print"

    return "decodes correctly at full size and at 300px (~2.5 cm print)"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate the QuickIn linktree QR code (static, no expiry).",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"default: {DEFAULT_URL}")
    parser.add_argument(
        "--out",
        default="~/Desktop",
        help="output directory (default: ~/Desktop)",
    )
    parser.add_argument(
        "--plain",
        action="store_true",
        help="black on white — the most reliable combination for cheap scanners",
    )
    parser.add_argument("--no-logo", action="store_true", help="skip the centre mark")
    parser.add_argument(
        "--scale",
        type=int,
        default=40,
        help="PNG pixels per module (default 40 ≈ 2000px wide)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    dark, light = ("#000000", "#FFFFFF") if args.plain else (BURGUNDY, CREAM)

    ratio = contrast_ratio(dark, light)
    if ratio < 3.0:
        print(f"  ! Contrast {ratio:.1f}:1 is too low — scanners will struggle.")
        print("    Re-run with --plain.")
        return 1

    # Error correction H (~30% recoverable) so the centre mark never costs us a
    # scan, and so the code survives a scuffed sticker or a crease in print.
    qr = segno.make(args.url, error="h")

    svg_path = out_dir / f"{BASENAME}.svg"
    png_path = out_dir / f"{BASENAME}.png"

    # border=4 is the spec-mandated quiet zone. Never reduce it — without that
    # margin of background, many readers cannot find the code at all.
    qr.save(svg_path, scale=10, dark=dark, light=light, border=4)
    qr.save(png_path, scale=args.scale, dark=dark, light=light, border=4)

    coverage = 0.0
    if not args.no_logo:
        coverage = add_logo(png_path, LOGO_PATH, light)

    result = verify(png_path, args.url)

    px = png_path.stat().st_size / 1024
    sv = svg_path.stat().st_size / 1024
    centre = f"QuickIn mark ({coverage:.1%} of area)" if coverage else "none"

    print("\n  QuickIn linktree QR — static, no expiry, no service account\n")
    print(f"  encodes   {args.url}")
    print(f"  version   {qr.version} · error correction H (~30% recoverable)")
    print(f"  colours   {dark} on {light}  ({ratio:.1f}:1 contrast)")
    print(f"  centre    {centre}")
    print(f"  verified  {result}\n")
    print(f"  {svg_path}   ({sv:.0f} KB)  ← print: vector, no centre mark")
    print(f"  {png_path}   ({px:.0f} KB)  ← screens/social: mark included\n")
    print("  Minimum reliable print size is about 2 x 2 cm.\n")

    return 1 if result.startswith("FAILED") else 0


if __name__ == "__main__":
    raise SystemExit(main())
