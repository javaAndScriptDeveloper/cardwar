#!/usr/bin/env python3
"""Turn chosen renders into transparent card portraits the poster generator can place.

    python3 cutout.py /workspace/ComfyUI/output/cardwar/blogery/lachen_1234_00001_.png ...
    python3 cutout.py --out /workspace/portraits ComfyUI/output/cardwar/blogery/*_00001_.png

For each file: remove the background (rembg), crop to the figure, fit it into a 480x672 canvas aligned to the bottom
edge (a bust standing on the card's name band) and save as <out>/<pack>/<tag>.png. The pack is the parent folder
name and the tag is the filename up to the first underscore, exactly as render.py writes them. A second file for the
same tag overwrites the first, so pass one keeper per persona.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image
from rembg import remove

W, H = 480, 672
PAD = 12


def portrait(source: Path) -> Image.Image:
    with Image.open(source) as image:
        cut = remove(image.convert("RGBA"))
    box = cut.getbbox()
    if box is None:
        raise ValueError(f"{source}: nothing left after background removal")
    figure = cut.crop(box)
    scale = min((W - 2 * PAD) / figure.width, (H - PAD) / figure.height)
    figure = figure.resize((round(figure.width * scale), round(figure.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(figure, ((W - figure.width) // 2, H - figure.height), figure)
    return canvas


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="/workspace/portraits")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args(argv)
    for name in args.files:
        source = Path(name)
        pack, tag = source.parent.name, source.stem.split("_")[0]
        target = Path(args.out) / pack / f"{tag}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        portrait(source).save(target, optimize=True)
        print(f"{target} <- {source.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
