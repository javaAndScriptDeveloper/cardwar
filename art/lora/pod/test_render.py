"""Pure parts of render.py: run with `python3 -m unittest discover -s art/lora/pod` (no GPU, no ComfyUI).

The prompt and the workflow patch are what decide whether a card comes out as a flat caricature in the deck's
palette or as a photo; a regression there costs a GPU hour, so they are pinned here.
"""

import json
import unittest
from pathlib import Path

from render import STYLE, build_prompt, patch_workflow

HERE = Path(__file__).parent
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


class PromptTest(unittest.TestCase):
    def test_prompt_leads_with_the_trigger_and_asks_for_painted_card_art(self):
        prompt = build_prompt(PERSONA)
        self.assertTrue(prompt.startswith("cw_lachen"))
        self.assertIn("caricature", prompt)
        self.assertIn("hearthstone style card art", prompt)
        self.assertIn(STYLE, prompt)
        self.assertNotIn("photo", prompt.replace("photorealistic", ""))

    def test_persona_art_role_replaces_the_generic_subject_and_keeps_the_trigger(self):
        persona = {**PERSONA, "art": "a strong green goblin warrior with a black cat on his shoulder"}
        prompt = build_prompt(persona)
        self.assertIn("cw_lachen reimagined as a strong green goblin warrior with a black cat on his shoulder", prompt)
        self.assertIn("recognisable face of cw_lachen", prompt)
        self.assertNotIn("a caricature of cw_lachen", prompt)

    def test_prompt_carries_the_persona_colour_and_role_hint(self):
        prompt = build_prompt(PERSONA)
        self.assertIn("#283593", prompt)
        self.assertIn("пише", prompt)

    def test_extra_hint_is_appended(self):
        self.assertTrue(build_prompt(PERSONA, hint="holding a phone").endswith("holding a phone"))


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        self.workflow = json.loads((HERE / "workflow-card.json").read_text())

    def test_patch_sets_lora_prompt_seed_and_filename(self):
        patched = patch_workflow(self.workflow, lora="blogery-lachen.safetensors", prompt="p", seed=7, prefix="x/y")
        nodes = list(patched.values())
        lora = next(n for n in nodes if n["class_type"] == "LoraLoaderModelOnly")
        self.assertEqual(lora["inputs"]["lora_name"], "blogery-lachen.safetensors")
        positive = next(n for n in nodes if n["class_type"] == "CLIPTextEncode" and n["_meta"]["title"] == "positive")
        self.assertEqual(positive["inputs"]["text"], "p")
        sampler = next(n for n in nodes if n["class_type"] == "KSampler")
        self.assertEqual(sampler["inputs"]["seed"], 7)
        save = next(n for n in nodes if n["class_type"] == "SaveImage")
        self.assertEqual(save["inputs"]["filename_prefix"], "x/y")

    def test_patch_does_not_mutate_the_template(self):
        before = json.dumps(self.workflow, sort_keys=True)
        patch_workflow(self.workflow, lora="a", prompt="b", seed=1, prefix="c")
        self.assertEqual(before, json.dumps(self.workflow, sort_keys=True))

    def test_card_canvas_is_the_poster_ratio_in_multiples_of_16(self):
        latent = next(n for n in self.workflow.values() if n["class_type"] == "EmptySD3LatentImage")
        width, height = latent["inputs"]["width"], latent["inputs"]["height"]
        self.assertEqual((width, height), (480, 672))
        self.assertEqual(width * 336, height * 240)
        self.assertEqual(width % 16 + height % 16, 0)


if __name__ == "__main__":
    unittest.main()
