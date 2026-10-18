"""portraits.py turns the owner's `final/` picks into card-sized JPEGs the pack generator embeds; pinned here because
the order (first role, then the alt role) decides which face lands on which suit."""

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from portraits import PORTRAIT_SIZE, collect, convert


class PortraitsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def render(self, rel: str) -> Path:
        path = self.root / "renders" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (480, 672), "#336699").save(path)
        return path

    def test_collect_lists_first_role_before_alt_per_tag(self):
        self.render("sluhy-narodu/yermak/final/yermak-alt_3002_00001_.png")
        self.render("sluhy-narodu/yermak/final/yermak_2001_00001_.png")
        self.render("extra/mindich/final/mindich_2001_00001_.png")
        self.render("extra/mindich/v1/mindich_2002_00001_.png")  # not a final pick

        picks = collect(self.root / "renders")

        self.assertEqual(
            {tag: [p.name for p in files] for tag, files in picks.items()},
            {
                "yermak": ["yermak_2001_00001_.png", "yermak-alt_3002_00001_.png"],
                "mindich": ["mindich_2001_00001_.png"],
            },
        )

    def test_convert_writes_card_sized_jpegs_numbered_per_tag(self):
        src = self.render("sluhy-narodu/yermak/final/yermak_2001_00001_.png")
        out = self.root / "out"

        written = convert({"yermak": [src]}, out)

        self.assertEqual(written, [out / "yermak" / "1.jpg"])
        with Image.open(written[0]) as im:
            self.assertEqual(im.format, "JPEG")
            self.assertEqual(im.size, PORTRAIT_SIZE)


if __name__ == "__main__":
    unittest.main()
