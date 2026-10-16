#!/usr/bin/env python3
"""Render caricature portraits for every trained persona through a running ComfyUI.

    python3 render.py --pack blogery --variants 8          # all personas of one pack, 8 seeds each
    python3 render.py --tag lachen --variants 20 --hint "holding a phone"
    python3 render.py --all

Reads ../personas.json, patches workflow-card.json per persona (LoRA file, prompt, seed, output prefix) and queues it
at ComfyUI's /prompt endpoint. Images land in ComfyUI/output/cardwar/<pack>/<tag>_<seed>_*.png; pick the keepers,
then cutout.py turns them into transparent portraits. Pure helpers (build_prompt, patch_workflow) are unit-tested in
test_render.py; the HTTP part is a thin wrapper and is not.
"""

import argparse
import copy
import json
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
PERSONAS = HERE.parent / "personas.json"
WORKFLOW = HERE / "workflow-card.json"

# The house style every pack shares (owner's direction, 2026-10-17): painted collectible-card art, a friendly
# caricature, never a photo. The card frame, name band and «САТИРА» stamp are drawn by the poster generator later,
# so the portrait must come out as a bust against a dark, simple background that cuts out cleanly.
STYLE = (
    "hearthstone style card art, painterly digital illustration, exaggerated friendly caricature, "
    "dynamic head and shoulders bust, warm rim light, rich saturated colours, dark vignette background, "
    "no text, no letters, no logo"
)


def build_prompt(persona: dict, hint: str = "") -> str:
    """The trigger word first (that is what the LoRA keys on), the persona's fantasy role when the roster has one,
    then the shared style, the deck colour and the role for a prop idea."""
    trigger = persona["trigger"]
    subject = (
        f"{trigger} reimagined as {persona['art']}, recognisable face of {trigger}"
        if persona.get("art")
        else f"a caricature of {trigger}"
    )
    parts = [
        trigger,
        subject,
        STYLE,
        f"background colour {persona['colour']}",
        f"character theme: {persona['role']}",
    ]
    if hint:
        parts.append(hint)
    return ", ".join(parts)


def patch_workflow(
    workflow: dict, *, lora: str, prompt: str, seed: int, prefix: str, strength: float | None = None
) -> dict:
    """A deep copy of the template with the per-render fields filled in; the LoRA strength only when asked
    (lower it when the style collapses into a photo, raise it when the face drifts)."""
    patched = copy.deepcopy(workflow)
    for node in patched.values():
        kind = node["class_type"]
        title = node.get("_meta", {}).get("title")
        if kind == "LoraLoaderModelOnly":
            node["inputs"]["lora_name"] = lora
            if strength is not None:
                node["inputs"]["strength_model"] = strength
        elif kind == "CLIPTextEncode" and title == "positive":
            node["inputs"]["text"] = prompt
        elif kind == "KSampler":
            node["inputs"]["seed"] = seed
        elif kind == "SaveImage":
            node["inputs"]["filename_prefix"] = prefix
    return patched


def queue(server: str, workflow: dict) -> str:
    body = json.dumps({"prompt": workflow}).encode()
    request = urllib.request.Request(f"{server}/prompt", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["prompt_id"]


def wait_idle(server: str, poll: float = 5.0) -> None:
    """Blocks until ComfyUI's queue is empty so the script ends when the last image is on disk."""
    while True:
        with urllib.request.urlopen(f"{server}/queue", timeout=30) as response:
            state = json.load(response)
        if not state["queue_running"] and not state["queue_pending"]:
            return
        time.sleep(poll)


def select(personas: list, *, pack: str | None, tag: str | None, everything: bool) -> list:
    if everything:
        return personas
    if tag:
        return [p for p in personas if p["tag"] == tag]
    if pack:
        return [p for p in personas if p["pack"] == pack]
    return []


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", default="http://127.0.0.1:8188")
    parser.add_argument("--pack")
    parser.add_argument("--tag")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--variants", type=int, default=8)
    parser.add_argument("--hint", default="", help="extra prompt text, e.g. a prop")
    parser.add_argument("--seed", type=int, help="first seed; random when omitted")
    parser.add_argument("--strength", type=float, help="LoRA strength override (template: 0.9)")
    parser.add_argument("--no-wait", action="store_true", help="queue and exit instead of waiting for the images")
    args = parser.parse_args(argv)

    personas = select(json.loads(PERSONAS.read_text()), pack=args.pack, tag=args.tag, everything=args.all)
    if not personas:
        parser.error("nothing selected: pass --pack <id>, --tag <tag> or --all")
    template = json.loads(WORKFLOW.read_text())
    first_seed = args.seed if args.seed is not None else random.SystemRandom().randrange(2**31)

    queued = 0
    for persona in personas:
        lora = f"{persona['pack']}-{persona['tag']}.safetensors"
        prompt = build_prompt(persona, args.hint)
        for i in range(args.variants):
            seed = first_seed + i
            prefix = f"cardwar/{persona['pack']}/{persona['tag']}_{seed}"
            try:
                queue(
                    args.server,
                    patch_workflow(
                        template, lora=lora, prompt=prompt, seed=seed, prefix=prefix, strength=args.strength
                    ),
                )
            except urllib.error.URLError as error:
                print(f"ComfyUI at {args.server} refused the job: {error}", file=sys.stderr)
                return 1
            queued += 1
        print(f"{persona['name']}: {args.variants} variants queued with {lora}")

    print(f"{queued} images queued; output under ComfyUI/output/cardwar/<pack>/")
    if not args.no_wait:
        wait_idle(args.server)
        print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
