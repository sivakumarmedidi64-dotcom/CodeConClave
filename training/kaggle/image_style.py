# CodeConClave image style - runs on Kaggle's free GPU as a background job (no browser tab to keep open).
# Teaches Stable Diffusion 1.5 a picture style with a LoRA, using the official diffusers DreamBooth
# script, then proves it: the same prompts and seeds WITHOUT and WITH the style, side by side.
# Pictures: public-domain Japanese woodblock prints (Art Institute of Chicago, CC0), or a Kaggle
# dataset of your own pictures attached at /kaggle/input/<name>.
# Everything lands in /kaggle/working (the job's output): image_style/ + report.json.
import json
import shutil
import subprocess
import time
from pathlib import Path

INSTANCE_PROMPT = "a picture in ccv style"   # the magic words that switch the style on
TEST_PROMPTS = ["a cat sitting on a chair", "a city street at night", "a plate of chicken biryani", "a portrait of a smiling young man"]
IMAGE_STEPS = 600
IMAGE_BASE = "stable-diffusion-v1-5/stable-diffusion-v1-5"   # CreativeML OpenRAIL-M

OUT = Path("/kaggle/working")
REPORT = OUT / "report.json"
report = {"image": {"status": "running", "started": time.strftime("%Y-%m-%d %H:%M")}}


def save_report():
    REPORT.write_text(json.dumps(report, indent=2))


def run(cmd):
    print("$", cmd, flush=True)
    if subprocess.run(cmd, shell=True).returncode != 0:
        raise SystemExit(f"STOPPED: this step failed: {cmd[:120]}")


def fetch_public_domain_pictures(dest, want=20):
    import requests
    dest.mkdir(parents=True, exist_ok=True)
    headers = {"AIC-User-Agent": "CodeConClave-tuning"}
    got = 0
    for artist in ["hiroshige", "hokusai"]:
        try:
            r = requests.get("https://api.artic.edu/api/v1/artworks/search", headers=headers, timeout=30,
                             params={"q": artist, "query[term][is_public_domain]": "true", "fields": "id,title,image_id", "limit": 40})
            r.raise_for_status()
            works = r.json().get("data", [])
        except Exception as e:
            print("could not search the museum collection:", e)
            continue
        for a in works:
            if got >= want:
                break
            if not a.get("image_id"):
                continue
            try:
                img = requests.get(f"https://www.artic.edu/iiif/2/{a['image_id']}/full/843,/0/default.jpg", headers=headers, timeout=30)
                if img.ok and img.headers.get("content-type", "").startswith("image"):
                    (dest / f"aic_{a['id']}.jpg").write_bytes(img.content)
                    got += 1
            except Exception as e:
                print("skipping one picture:", e)
    return sorted(dest.glob("*.jpg"))


def main():
    import torch
    if not torch.cuda.is_available():
        raise SystemExit("STOPPED: no GPU - this job must run with the GPU turned on")
    print("GPU:", torch.cuda.get_device_name(0))
    save_report()

    # pictures: an attached Kaggle dataset of your own, else the free public-domain prints
    own = [p for p in Path("/kaggle/input").rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")] if Path("/kaggle/input").exists() else []
    if len(own) >= 5:
        pics, source = own, "your own pictures (attached Kaggle dataset)"
    else:
        pics = fetch_public_domain_pictures(Path("/kaggle/temp/public_pictures"))
        source = f"{len(pics)} public-domain woodblock prints, Art Institute of Chicago (CC0)"
    from PIL import Image
    work = Path("/kaggle/temp/my_images")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    n = 0
    for p in pics[:60]:
        try:
            im = Image.open(p).convert("RGB")
            im.thumbnail((1024, 1024))
            im.save(work / f"{n:03d}.jpg", quality=95)
            n += 1
        except Exception as e:
            print("skipping", p.name, "-", e)
    if n < 5:
        raise SystemExit(f"STOPPED: only {n} pictures could be used")
    print(f"training on {n} pictures from: {source}")

    run("pip -q install diffusers peft accelerate")
    # the image ships an old torchao that new peft refuses to load next to; we do not need it
    run("pip -q uninstall -y torchao")
    import diffusers
    branch = "main" if "dev" in diffusers.__version__ else f"v{diffusers.__version__}"
    src = Path("/kaggle/temp/diffusers_src")
    shutil.rmtree(src, ignore_errors=True)
    run(f"git clone -q --depth 1 --branch {branch} https://github.com/huggingface/diffusers {src}")
    script = src / "examples/dreambooth/train_dreambooth_lora.py"
    if not script.exists():
        raise SystemExit("STOPPED: the official training script was not found")

    lora_out = Path("/kaggle/temp/lora_out")
    shutil.rmtree(lora_out, ignore_errors=True)
    run(f'python "{script}" --pretrained_model_name_or_path="{IMAGE_BASE}" --instance_data_dir="{work}" '
        f'--output_dir="{lora_out}" --instance_prompt="{INSTANCE_PROMPT}" --resolution=512 '
        f'--train_batch_size=1 --gradient_accumulation_steps=1 --learning_rate=1e-4 '
        f'--lr_scheduler=constant --lr_warmup_steps=0 --max_train_steps={IMAGE_STEPS} '
        f'--checkpointing_steps=100000 --mixed_precision=fp16 --seed=42')
    weights = lora_out / "pytorch_lora_weights.safetensors"
    if not weights.exists() or weights.stat().st_size < 500_000:
        raise SystemExit("STOPPED: training finished but no style file was made")

    # proof: same prompt + same seed, WITHOUT and WITH the style
    import numpy as np
    from diffusers import StableDiffusionPipeline
    pipe = StableDiffusionPipeline.from_pretrained(IMAGE_BASE, torch_dtype=torch.float16).to("cuda")

    def gen(prompt, seed):
        g = torch.Generator("cuda").manual_seed(seed)
        return pipe(prompt, num_inference_steps=30, guidance_scale=7.5, generator=g).images[0]
    prompts = [f"{p}, {INSTANCE_PROMPT}" for p in TEST_PROMPTS]
    before = [gen(p, i) for i, p in enumerate(prompts)]
    pipe.load_lora_weights(str(lora_out))
    after = [gen(p, i) for i, p in enumerate(prompts)]
    diffs = [float(np.abs(np.asarray(a, dtype=np.float32) - np.asarray(b, dtype=np.float32)).mean()) for a, b in zip(after, before)]
    print("how much the style changed each picture (0 = no change):", [round(d, 1) for d in diffs])
    if max(diffs) < 2.0:
        raise SystemExit("STOPPED: the style had no visible effect")

    style = OUT / "image_style"
    shutil.rmtree(style, ignore_errors=True)
    style.mkdir()
    shutil.copyfile(weights, style / "pytorch_lora_weights.safetensors")
    w, h = before[0].size
    grid = Image.new("RGB", (w * len(before), h * 2), "white")
    for i, (b, a) in enumerate(zip(before, after)):
        grid.paste(b, (i * w, 0))
        grid.paste(a, (i * w, h))
    grid.save(style / "before_top_after_bottom.png")
    meta = {"base": IMAGE_BASE, "instance_prompt": INSTANCE_PROMPT, "pictures": n, "pictures_from": source, "steps": IMAGE_STEPS,
            "diffusers": diffusers.__version__, "style_change_per_picture": [round(d, 1) for d in diffs], "test_prompts": prompts}
    (style / "codeconclave_image_style.json").write_text(json.dumps(meta, indent=2))
    report["image"] = {"status": "done", "finished": time.strftime("%Y-%m-%d %H:%M"), **meta}
    save_report()
    print("IMAGE STYLE DONE")


try:
    main()
except BaseException as e:   # write the failure down - never leave "running" behind
    report["image"] = {"status": "failed", "why": str(e)[:500], "at": time.strftime("%Y-%m-%d %H:%M")}
    save_report()
    raise
