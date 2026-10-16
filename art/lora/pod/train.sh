#!/usr/bin/env bash
# Train one persona LoRA with ai-toolkit and install it where ComfyUI (and render.py) expect it.
#
#   bash pod/train.sh blogery-lachen            # one job (config from pod/make_train_configs.py)
#   bash pod/train.sh all                       # every config in pod/configs, one after another
#
# About 25-40 minutes per persona on an RTX 4090 at 1800 steps. Samples appear in /workspace/output/<job>/samples
# every 300 steps; stop early with Ctrl-C if they already look right, the last checkpoint is kept.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORK=${WORK:-/workspace}
TOOLKIT=$WORK/ai-toolkit
LORAS=$WORK/ComfyUI/models/loras

# ai-toolkit downloads the gated FLUX.1-dev diffusers repo itself, so it needs the same token setup.sh used.
if [[ -z "${HF_TOKEN:-}" && -r $WORK/.hf_token ]]; then
    HF_TOKEN=$(tr -d '[:space:]' < "$WORK/.hf_token")
    export HF_TOKEN
fi

if [[ $# -ne 1 ]]; then
    echo "usage: train.sh <pack>-<tag> | all" >&2
    exit 2
fi

train_one() {
    local job=$1
    local config=$HERE/configs/$job.yaml
    [[ -f $config ]] || { echo "no config $config: run make_train_configs.py first" >&2; return 1; }
    echo "== training $job"
    (cd "$TOOLKIT" && python run.py "$config")
    local latest
    latest=$(ls -t "$WORK/output/$job/"*.safetensors | head -1)
    mkdir -p "$LORAS"
    cp "$latest" "$LORAS/$job.safetensors"
    echo "== installed $LORAS/$job.safetensors"
}

if [[ $1 == all ]]; then
    for config in "$HERE"/configs/*.yaml; do
        train_one "$(basename "$config" .yaml)"
    done
else
    train_one "$1"
fi
