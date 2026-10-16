#!/usr/bin/env bash
# One-shot setup of a fresh RunPod pod (PyTorch template, one 24 GB+ GPU) for training persona LoRAs and rendering
# card portraits. Idempotent: re-run after a pod restart, it skips what is already there.
#
#   export HF_TOKEN=hf_...          # a Hugging Face token that has accepted the FLUX.1-dev licence; never echoed
#   bash /workspace/cardwar-art/pod/setup.sh
#
# Everything lands on the persistent volume under /workspace so a stopped pod keeps models, datasets and LoRAs.
set -euo pipefail

WORK=${WORK:-/workspace}
COMFY=$WORK/ComfyUI
TOOLKIT=$WORK/ai-toolkit
# Ubuntu 24.04 images mark the system Python as externally managed; the pod is disposable, so pip may use it.
export PIP_BREAK_SYSTEM_PACKAGES=1

# The token may also sit in a 600 file the owner wrote through the RunPod web terminal, so nobody has to paste it
# into a chat or a shell history.
if [[ -z "${HF_TOKEN:-}" && -r $WORK/.hf_token ]]; then
    HF_TOKEN=$(tr -d '[:space:]' < "$WORK/.hf_token")
    export HF_TOKEN
fi
if [[ -z "${HF_TOKEN:-}" ]]; then
    echo "HF_TOKEN is not set: Flux dev is gated, accept the licence on huggingface.co and export a read token" >&2
    exit 1
fi

echo "== system packages"
apt-get update -qq && apt-get install -y -qq git python3-venv libgl1 libglib2.0-0 >/dev/null

echo "== ComfyUI"
if [[ ! -d $COMFY ]]; then
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "$COMFY"
fi
pip install -q -r "$COMFY/requirements.txt"

echo "== ai-toolkit (ostris) for LoRA training"
if [[ ! -d $TOOLKIT ]]; then
    git clone --depth 1 https://github.com/ostris/ai-toolkit "$TOOLKIT"
    (cd "$TOOLKIT" && git submodule update --init --recursive)
fi
pip install -q -r "$TOOLKIT/requirements.txt"

echo "== helpers (captioning, background removal)"
pip install -q "huggingface_hub>=0.25" pillow "rembg[cpu]" onnxruntime

echo "== models (skips files already on the volume)"
mkdir -p "$COMFY/models/diffusion_models" "$COMFY/models/text_encoders" "$COMFY/models/vae" "$COMFY/models/loras"
python3 - "$COMFY" <<'PY'
import os, shutil, sys
from pathlib import Path
from huggingface_hub import hf_hub_download

comfy = Path(sys.argv[1])
wanted = [
    ("black-forest-labs/FLUX.1-dev", "flux1-dev.safetensors", "diffusion_models"),
    ("black-forest-labs/FLUX.1-dev", "ae.safetensors", "vae"),
    ("comfyanonymous/flux_text_encoders", "clip_l.safetensors", "text_encoders"),
    ("comfyanonymous/flux_text_encoders", "t5xxl_fp8_e4m3fn.safetensors", "text_encoders"),
]
for repo, name, folder in wanted:
    target = comfy / "models" / folder / name
    if target.exists():
        print(f"   have {name}")
        continue
    print(f"   fetch {name} from {repo}")
    path = hf_hub_download(repo, name, token=os.environ["HF_TOKEN"])
    shutil.copy(path, target)
PY

mkdir -p "$WORK/dataset" "$WORK/output"
cat <<EOF

Ready.
  ComfyUI:    cd $COMFY && python main.py --listen 0.0.0.0 --port 8188
  Datasets:   $WORK/dataset/<pack>/<tag>/*.jpg   (then pod/caption.py)
  Train:      bash pod/train.sh <pack>-<tag>      (after pod/make_train_configs.py)
EOF
