"""make_train_configs.py renders one ai-toolkit job per persona; the fields that cost a wasted training run are pinned."""

import unittest

from make_train_configs import render_config

PERSONA = {
    "pack": "blogery",
    "tag": "lachen",
    "trigger": "cw_lachen",
    "name": "Лачен",
    "role": "пише",
    "colour": "#283593",
    "rank": "SIX",
    "cards": ["SIX_OF_CLUBS", "SIX_OF_DIAMONDS", "SIX_OF_HEARTS", "SIX_OF_SPADES"],
}


class ConfigTest(unittest.TestCase):
    def test_job_is_named_after_pack_and_tag_so_the_lora_file_matches_render(self):
        config = render_config(PERSONA, dataset_root="/workspace/dataset", steps=1800)
        self.assertIn('name: "blogery-lachen"', config)
        self.assertIn('trigger_word: "cw_lachen"', config)
        self.assertIn('folder_path: "/workspace/dataset/blogery/lachen"', config)
        self.assertIn("steps: 1800", config)

    def test_flux_dev_with_quantisation_fits_a_24gb_card(self):
        config = render_config(PERSONA, dataset_root="/d", steps=1)
        self.assertIn("black-forest-labs/FLUX.1-dev", config)
        self.assertIn("quantize: true", config)
        self.assertIn("low_vram: true", config)
        self.assertIn("gradient_checkpointing: true", config)

    def test_sample_prompts_use_the_trigger_placeholder(self):
        config = render_config(PERSONA, dataset_root="/d", steps=1)
        self.assertIn("[trigger]", config)
        self.assertIn("caricature", config)


if __name__ == "__main__":
    unittest.main()
