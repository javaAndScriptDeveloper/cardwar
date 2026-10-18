#!/usr/bin/env python3
"""portraits.py [renders dir] [out dir]: card-sized JPEGs from the owner's picks.

The owner drops the renders he keeps into `renders/<pack>/<tag>/final/` in the private art-data checkout
(`art/lora/dataset`). This writes `out/portraits/<tag>/<n>.jpg` at 360×504, the first role first and the alt
role second, so `client/scripts/gen-pack-satire.mjs` can embed face 1 and face 2 of each persona without knowing
the seeds. `out/` is gitignored: the portraits reach the public repo only inside the generated card SVGs.
"""

import sys
from pathlib import Path

from PIL import Image

PORTRAIT_SIZE = (360, 504)
QUALITY = 85


def _order(path: Path) -> tuple[int, str]:
    """First role (`<tag>_<seed>`) before the alt role (`<tag>-alt_<seed>`), seeds ascending within a role."""
    stem = path.name.split("_", 1)[0]
    return (1 if stem.endswith("-alt") else 0, path.name)


def collect(renders: Path) -> dict[str, list[Path]]:
    picks: dict[str, list[Path]] = {}
    for final in sorted(renders.glob("*/*/final")):
        files = sorted(final.glob("*.png"), key=_order)
        if files:
            picks[final.parent.name] = files
    return picks


def convert(picks: dict[str, list[Path]], out: Path) -> list[Path]:
    written: list[Path] = []
    for tag, files in picks.items():
        (out / tag).mkdir(parents=True, exist_ok=True)
        for n, src in enumerate(files, start=1):
            dst = out / tag / f"{n}.jpg"
            with Image.open(src) as im:
                im.convert("RGB").resize(PORTRAIT_SIZE, Image.LANCZOS).save(dst, "JPEG", quality=QUALITY, optimize=True)
            written.append(dst)
    return written


def main(argv: list[str]) -> int:
    here = Path(__file__).resolve().parent.parent
    renders = Path(argv[1]) if len(argv) > 1 else here / "dataset" / "renders"
    out = Path(argv[2]) if len(argv) > 2 else here / "out" / "portraits"
    picks = collect(renders)
    written = convert(picks, out)
    for tag, files in picks.items():
        print(f"{tag}: {len(files)}")
    print(f"{len(written)} portraits -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
