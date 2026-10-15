#!/usr/bin/env python3
"""Prepare a persona's photo folder for training: downscale, convert to JPEG, write a caption per photo.

    python3 caption.py /workspace/dataset/blogery/lachen
    python3 caption.py /workspace/dataset/blogery/*          # every persona of a pack

Captions use ai-toolkit's `[trigger]` placeholder (replaced by the job's trigger_word), say "photo" because the
training photos are photos, and describe nothing else: the LoRA should learn the face, not the clothes or the
background of one particular shot. Existing .txt captions are kept, so hand-written ones win.
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps

PHOTO = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
MAX_SIDE = 1280
CAPTION = "[trigger], portrait photo of [trigger], looking at the camera"


def prepare(folder: Path) -> int:
    count = 0
    for source in sorted(folder.iterdir()):
        if source.suffix.lower() not in PHOTO:
            continue
        target = source.with_suffix(".jpg")
        if source.suffix.lower() != ".jpg" or max(Image.open(source).size) > MAX_SIDE:
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((MAX_SIDE, MAX_SIDE))
                image.save(target, quality=92)
            if target != source:
                source.unlink()
        caption = target.with_suffix(".txt")
        if not caption.exists():
            caption.write_text(CAPTION + "\n")
        count += 1
    return count


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for arg in argv:
        folder = Path(arg)
        if not folder.is_dir():
            print(f"skip {folder}: not a folder")
            continue
        count = prepare(folder)
        verdict = "ok" if count >= 15 else "thin, aim for 15-25 varied photos"
        print(f"{folder.name}: {count} photos captioned ({verdict})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
