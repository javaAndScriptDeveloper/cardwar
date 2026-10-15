# Persona portraits: Flux LoRA pipeline

Caricature portraits of the satire personas (`client/scripts/rosters/*.mjs`), drawn by FLUX.1-dev with one small LoRA
per person, trained on ~20 photos each, on a rented GPU. Output: one transparent 480×672 PNG per persona, which the
poster generator places on that persona's four cards (issue #97).

Nothing personal is committed: photos, LoRAs and renders are gitignored (`art/lora/.gitignore`). What *is* committed
is the plumbing: `personas.json` (who sits on which card, generated from the rosters), the training config template,
the ComfyUI workflow and the scripts around them. Tests: `node --test art/lora/personas.test.mjs` and
`python3 -m unittest discover -s art/lora/pod`; CI runs both.

## Before you start: rights and licences

- **Photos.** You need the right to use every training photo. Own shots, press kits and CC-licensed photos are fine;
  random Instagram grabs are not. Keep them under `art/lora/dataset/` (gitignored), delete after training.
- **Likeness.** A drawn caricature of a public figure in satire is defensible speech in Ukraine (ст. 34 Конституції),
  selling it as a coin item is commercial use (ЦКУ ст. 308). Keep the «САТИРА» stamp, keep it a caricature, keep the
  one-click kill switch (`shop_item.is_active`). One hour with an IP lawyer before the first paid satire deck.
- **Model licence.** FLUX.1-dev is **non-commercial** out of the box. For a paid game either buy Black Forest Labs'
  self-serve dev commercial licence (bfl.ai) before launch, or switch the trainer and the workflow to an Apache-2.0
  model (Qwen-Image; ai-toolkit supports it, ComfyUI too). The scripts only hard-code the model name in
  `pod/make_train_configs.py` and `pod/workflow-card.json`, so the swap is two edits.
- **LoRA files** encode a face. Treat them like the photos: private volume, never the repo.

## Layout

```
art/lora/
  personas.mjs / personas.json   who → trigger word → cards (regenerate: node art/lora/personas.mjs)
  dataset/<pack>/<tag>/*.jpg     your photos, 15–25 per person (local, gitignored)
  out/portraits/<pack>/<tag>.png the result, copied back from the pod (gitignored until #97 wires them in)
  pod/setup.sh                   installs ComfyUI, ai-toolkit, downloads Flux dev + encoders (needs HF_TOKEN)
  pod/caption.py                 downsizes photos, writes the training captions
  pod/make_train_configs.py      one ai-toolkit YAML per persona → pod/configs/
  pod/train.sh                   trains a job, installs the LoRA into ComfyUI/models/loras/<pack>-<tag>.safetensors
  pod/workflow-card.json         ComfyUI API workflow: Flux dev fp8 + LoRA → 480×672 caricature bust
  pod/render.py                  queues N seeds per persona through the ComfyUI API
  pod/cutout.py                  background removal + fit → transparent portrait PNG
```

## Step by step

### 0. Collect photos (laptop, no GPU)

For each persona, 15–25 photos into `art/lora/dataset/<pack>/<tag>/` (tags in `personas.json`, e.g.
`dataset/blogery/lachen/`). Mix matters more than count: different angles, lighting, expressions, with and without
glasses or hat if they wear them, no other faces in frame, face at least ~300 px tall. Skip heavy filters and group
shots.

### 1. Rent the GPU

RunPod → Pods → Deploy. Pick:

| Setting | Value |
|---|---|
| GPU | RTX 4090 24 GB (cheapest that fits; A40/A6000 48 GB if you want ComfyUI up while training) |
| Template | RunPod PyTorch 2.4 (CUDA 12.4) |
| Volume | 100 GB network volume mounted at `/workspace` (models alone are ~30 GB) |
| Ports | HTTP 8188 (ComfyUI), TCP 22 (SSH) |
| SSH key | your `~/.ssh/id_ed25519.pub` in RunPod account settings |

Cost at the time of writing: about $0.35–0.70 per GPU hour, volume ~$7 per month. Budget for the whole set of 18
personas: ~10 GPU hours, under $15. Stop (not terminate) the pod between sessions; the volume keeps everything.

### 2. Set up the pod (once per volume)

Connect with the SSH command RunPod shows (`ssh root@<ip> -p <port>`). Then:

```bash
git clone --depth 1 https://github.com/javaAndScriptDeveloper/cardwar /workspace/cardwar-art
export HF_TOKEN=hf_...     # read token from huggingface.co/settings/tokens; accept the FLUX.1-dev licence first
bash /workspace/cardwar-art/art/lora/pod/setup.sh
```

15–25 minutes, mostly the 24 GB model download. Re-run after any pod restart; it skips what is present.

### 3. Upload photos and caption them

From your laptop:

```bash
scp -P <port> -r art/lora/dataset/blogery root@<ip>:/workspace/dataset/
```

On the pod:

```bash
cd /workspace/cardwar-art/art/lora
python3 pod/caption.py /workspace/dataset/blogery/*
```

Writes `<photo>.txt` next to each photo (`[trigger], portrait photo of [trigger], looking at the camera`) and
downsizes anything over 1280 px. Hand-written captions are kept.

### 4. Train (one LoRA per persona)

```bash
python3 pod/make_train_configs.py            # writes pod/configs/<pack>-<tag>.yaml for every folder with photos
bash pod/train.sh blogery-lachen             # ~30 min on a 4090 at 1800 steps
bash pod/train.sh all                        # the whole pack, sequentially; start it in tmux and go to sleep
```

Watch `/workspace/output/<job>/samples/`: a new sample every 300 steps, prompts from the config (one caricature, one
photo). Stop with Ctrl-C when the caricature sample is already recognisable; `train.sh` installs the latest
checkpoint. Not recognisable at 1800 steps → more varied photos, not more steps. Looks like a photocopy of one
training shot → fewer near-duplicate photos, or lower `steps` to 1200.

On a 24 GB card do not run ComfyUI at the same time as training (both want the whole card).

### 5. Render candidates

```bash
cd /workspace/ComfyUI && nohup python main.py --listen 0.0.0.0 --port 8188 > /workspace/comfy.log 2>&1 &
cd /workspace/cardwar-art/art/lora
python3 pod/render.py --pack blogery --variants 8          # 8 seeds per persona, ~15 s each
python3 pod/render.py --tag lachen --variants 20 --hint "holding a phone, hoodie"
```

Browse the results at `https://<pod-id>-8188.proxy.runpod.net` (Queue → History) or under
`/workspace/ComfyUI/output/cardwar/<pack>/`. The house style is fixed in `render.py` (`STYLE`): flat vector
caricature, bold outlines, poster colours, bust, plain background, no text. The LoRA strength (0.9) and guidance
(3.5) live in `workflow-card.json`; lower strength if the style collapses into a photo, raise it if the face drifts.

### 6. Cut out and bring back

Pick one keeper per persona, then:

```bash
python3 pod/cutout.py /workspace/ComfyUI/output/cardwar/blogery/lachen_1234_00001_.png \
                      /workspace/ComfyUI/output/cardwar/blogery/ramina_1234_00003_.png
```

Portraits land in `/workspace/portraits/<pack>/<tag>.png` (480×672, transparent, bust on the bottom edge). Laptop:

```bash
scp -P <port> -r root@<ip>:/workspace/portraits art/lora/out/
```

### 7. Into the game

Issue #97: the poster generator gets a `portrait` per persona (`art/lora/out/portraits/<pack>/<tag>.png`, embedded
in the face SVG as a data URI so faces stay self-contained), the spec §2 boundary is updated, the satire tests allow
the embedded portrait. Until then the vector avatars stay.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `setup.sh`: 401 on `flux1-dev.safetensors` | Accept the licence on the FLUX.1-dev model page with the same account as the token |
| Training OOM on 24 GB | Stop ComfyUI; make sure `quantize: true`, `low_vram: true` are in the config (they are by default) |
| `render.py`: `refused the job` | ComfyUI not running or wrong `--server`; check `/workspace/comfy.log` |
| `render.py` output is a photo | Lower `strength_model` to 0.7 in `workflow-card.json`, or add caricature words via `--hint` |
| Faces of two personas blend | Two configs share a trigger; `personas.test.mjs` guards that, re-run `node art/lora/personas.mjs` |
| `cutout.py` leaves a halo | Render with a plain background colour far from skin tones (`--hint "solid dark teal background"`) |
