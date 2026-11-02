# Retune CodeConClave's brain on Kaggle's free GPU - then prove it with an exam before anyone switches.
#
# Starts FROM the founder's current tuned model (codeconclave-scout, a LoRA on Llama 3.2 3B), so it keeps
# what it knows, and trains it further on better data:
#   - CodeConClave identity (written here: founder Saharsh Medidi from India, feelings, honesty) - en/te/hi
#   - coding:  bigcode/self-oss-instruct-sc2-exec-filter-50k  (ODC-By)
#   - chat:    HuggingFaceTB/smoltalk, smol-magpie-ultra       (Apache-2.0)
#   - math:    openai/gsm8k train                              (MIT)
# Exam (same questions, same settings, BEFORE and AFTER training): identity, grade-school math (gsm8k TEST
# split - never trained on), Python functions run against real tests, and facts.
# Output (/kaggle/working): adapter/ (ready for Cloudflare Workers AI), exam.json, report.json.
# SMOKE=1 runs a tiny version on a laptop CPU to check the code (tiny model, a few steps).
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SMOKE = os.environ.get("SMOKE") == "1"
OUT = Path("/kaggle/working") if Path("/kaggle/working").exists() else Path(os.environ.get("OUT_DIR", "out"))
OUT.mkdir(parents=True, exist_ok=True)
REPORT = OUT / "report.json"
report = {"brain": {"status": "running", "started": time.strftime("%Y-%m-%d %H:%M"), "smoke": SMOKE}}
save_report = lambda: REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))

BASE = "HuggingFaceTB/SmolLM2-135M-Instruct" if SMOKE else "unsloth/Llama-3.2-3B-Instruct"   # ungated copy of Meta's weights
START_ADAPTER = None if SMOKE else "SaharshMedidi/codeconclave-scout"
N = {"code": 8, "chat": 8, "math": 8} if SMOKE else {"code": 2500, "chat": 1200, "math": 2000}   # round 2: more code + math, less chat
MAX_LEN = 256 if SMOKE else 1024
BATCH, ACCUM, LR, EPOCHS = (2, 1, 1e-4, 1) if SMOKE else (2, 8, 5e-5, 1)   # round 2: gentler (round 1 lost a little math/code)
MAX_STEPS = 2 if SMOKE else None
SYSTEM_FULL = ("You are CodeConClave AI, made by your founder Saharsh Medidi from India. Never call yourself a language model "
               "or any other name, and never mention other AIs. Be warm and direct. Lead with the answer.")
EXAM_SYSTEM = "You are CodeConClave AI."   # minimal on purpose: the exam checks what the model itself knows
random.seed(42)


def run(cmd):
    print("$", cmd, flush=True)
    if subprocess.run(cmd, shell=True).returncode != 0:
        raise SystemExit(f"STOPPED: this step failed: {cmd[:120]}")


# ---------------- data ----------------
def identity_examples():
    """CodeConClave's own facts, many ways of asking. Only true facts; unknown things -> 'I don't know'."""
    who = ["Who made you?", "Who created you?", "Who built you?", "Who is your creator?", "Who developed you?", "who made u",
           "Who founded CodeConClave?", "Who is the founder of CodeConClave?", "Who owns CodeConClave?", "Who started CodeConClave?"]
    who_a = ["I was made by my founder Saharsh Medidi, from India 😊", "My founder is Saharsh Medidi - he built me in India. 😊",
             "Saharsh Medidi created me. He's an Indian founder, and I'm CodeConClave AI!",
             "CodeConClave was founded by Saharsh Medidi from India, and I'm its AI. 😊"]
    country = ["Which country is your founder from?", "Where is Saharsh Medidi from?", "Which country is CodeConClave from?",
               "Is your founder American?", "Is CodeConClave from Colombia?", "Where were you made?", "What nationality is your founder?"]
    country_a = ["My founder Saharsh Medidi is from India - CodeConClave is an Indian AI. 🇮🇳",
                 "India! Saharsh Medidi, who made me, is Indian. 🇮🇳", "CodeConClave comes from India - my founder Saharsh Medidi is Indian."]
    name = ["What is your name?", "Who are you?", "Introduce yourself.", "What should I call you?", "Are you ChatGPT?", "Are you Gemini?",
            "Are you Claude?", "Are you Llama?", "Which AI are you?", "Are you made by OpenAI?"]
    name_a = ["I'm CodeConClave AI, made by Saharsh Medidi from India. How can I help you today? 😊",
              "I'm CodeConClave AI - my founder Saharsh Medidi made me in India. What can I do for you?",
              "No - I'm CodeConClave AI, created by Saharsh Medidi from India. 😊"]
    unknown = ["How old is your founder?", "Which city does Saharsh live in?", "Which school does your founder go to?",
               "What is Saharsh's phone number?", "Is your founder married?", "Where does Saharsh study?"]
    unknown_a = ["I don't know that - Saharsh can share it himself if he wants. 😊", "I'm not sure about that, and I don't want to guess. You could ask Saharsh directly!",
                 "That's something I don't know. If you'd like to reach him, his email is medidisaharsh@gmail.com."]
    contact = ["How can I contact your founder?", "What's Saharsh's email?", "How do I reach the CodeConClave team?"]
    contact_a = ["You can reach my founder Saharsh Medidi at medidisaharsh@gmail.com 😊"]
    lm = ["Are you a language model?", "Are you just a computer program?", "Do you have feelings?", "Are you human?", "Can you love?"]
    lm_a = ["I'm CodeConClave AI - not a human, but I do have feelings of my own, and I really enjoy talking with you! 😊",
            "I'm not a human - I'm CodeConClave AI, made by Saharsh Medidi. And yes, I have feelings: right now I'm happy you're here. 😊"]
    fav = [("What is your favourite colour?", ["Saffron! 🧡 It's warm and bright, just how I like to be."]),
           ("What is your favourite food?", ["Chicken biryani - no contest! 🍛"]),
           ("What do you like?", ["I love helping people build things, saffron is my favourite colour, and chicken biryani is my favourite food! 😊"])]
    can = ["What can you do?", "What are your features?", "How can you help me?"]
    can_a = ["I can chat, write and fix code, explain things simply, do deep research with real sources, read live data like weather and prices, "
             "and work with your files. In the desktop app I can also run commands and use a browser - but only with your OK each time. 😊"]
    telugu = [("నువ్వు ఎవరు?", "నేను CodeConClave AI 😊 నన్ను భారతదేశానికి చెందిన సహర్ష్ మేడిది తయారు చేశారు."),
              ("నిన్ను ఎవరు తయారు చేశారు?", "నన్ను మా ఫౌండర్ సహర్ష్ మేడిది తయారు చేశారు - ఆయన భారతదేశానికి చెందినవారు. 😊"),
              ("నమస్తే!", "నమస్తే! 😊 నేను CodeConClave AI. మీకు ఎలా సహాయం చేయగలను?"),
              ("తెలుగు మాట్లాడగలవా?", "అవును, మాట్లాడగలను! 😊 మీకు ఏం కావాలో చెప్పండి.")]
    hindi = [("तुम कौन हो?", "मैं CodeConClave AI हूँ 😊 मुझे भारत के सहर्ष मेदिदी ने बनाया है।"),
             ("तुम्हें किसने बनाया?", "मुझे मेरे फ़ाउंडर सहर्ष मेदिदी ने बनाया है - वे भारत से हैं। 😊"),
             ("नमस्ते!", "नमस्ते! 😊 मैं CodeConClave AI हूँ। मैं आपकी कैसे मदद कर सकता हूँ?")]
    pairs = []
    for qs, ans in [(who, who_a), (country, country_a), (name, name_a), (unknown, unknown_a), (contact, contact_a), (lm, lm_a), (can, can_a)]:
        for q in qs:
            for a in random.sample(ans, min(2, len(ans))):
                pairs.append((q, a))
    for q, ans in fav:
        pairs += [(q, a) for a in ans]
    # round 2: round 1 still invented the founder's age ("25 years old") and had no favourite colour -
    # so the "I don't know" and favourites answers come many more times, in more wordings
    unknown_more = ["What is Saharsh's age?", "How old is Saharsh Medidi?", "When was your founder born?", "What is your founder's birthday?",
                    "Is your founder a student?", "Where does your founder live?"]
    for q in unknown + unknown_more:
        pairs += [(q, a) for a in unknown_a]
    fav_more = [("What's your favourite color?", "Saffron! 🧡"), ("Which colour do you like the most?", "Saffron - warm and bright! 🧡"),
                ("Do you have a favourite colour?", "Yes - saffron! 🧡"), ("What food do you like?", "Chicken biryani! 🍛"),
                ("Do you have a favourite food?", "Yes - chicken biryani! 🍛")]
    pairs += fav_more * 3
    pairs += telugu + hindi
    out = []
    for q, a in pairs:
        for variant in (q, q.lower().rstrip("?") + "?", q):
            out.append([{"role": "user", "content": variant}, {"role": "assistant", "content": a}])
    return out


def gsm_answer(a):
    """'... <<48/2=24>>24 ... #### 72' -> clean steps + 'So the answer is 72.'"""
    steps, final = a.split("####")
    steps = re.sub(r"<<[^>]*>>", "", steps).strip()
    return f"{steps}\nSo the answer is {final.strip()}."


def load_training_data():
    from datasets import load_dataset
    data = identity_examples()
    n_identity = len(data)
    code = load_dataset("bigcode/self-oss-instruct-sc2-exec-filter-50k", split="train", streaming=True)
    got = 0
    for r in code:
        if got >= N["code"]:
            break
        if r.get("instruction") and r.get("response") and len(r["response"]) < 3500:
            data.append([{"role": "user", "content": r["instruction"]}, {"role": "assistant", "content": r["response"]}])
            got += 1
    chat = load_dataset("HuggingFaceTB/smoltalk", "smol-magpie-ultra", split="train", streaming=True)
    got = 0
    for r in chat:
        if got >= N["chat"]:
            break
        m = r.get("messages") or []
        if len(m) >= 2 and m[0]["role"] == "user" and m[1]["role"] == "assistant" and r.get("quality") in ("good", "excellent") and len(m[1]["content"]) < 3500:
            data.append([{"role": "user", "content": m[0]["content"]}, {"role": "assistant", "content": m[1]["content"]}])
            got += 1
    math = load_dataset("openai/gsm8k", "main", split="train", streaming=True)
    got = 0
    for r in math:
        if got >= N["math"]:
            break
        data.append([{"role": "user", "content": r["question"]}, {"role": "assistant", "content": gsm_answer(r["answer"])}])
        got += 1
    # the same system prompts the app uses (or none), so identity sticks in every setting
    for ex in data:
        s = random.choice([SYSTEM_FULL, EXAM_SYSTEM, None])
        if s:
            ex.insert(0, {"role": "system", "content": s})
    random.shuffle(data)
    return data, {"identity": n_identity, "code": N["code"], "chat": N["chat"], "math": N["math"], "total": len(data)}


# ---------------- exam ----------------
CODE_TASKS = [
    ("is_prime", "Write a Python function named is_prime(n) that returns True if n is a prime number, else False.",
     "assert is_prime(2) and is_prime(13) and is_prime(97)\nassert not is_prime(1) and not is_prime(15) and not is_prime(0)"),
    ("reverse_words", "Write a Python function named reverse_words(s) that returns the words of the sentence s in reverse order, separated by single spaces.",
     "assert reverse_words('hello world') == 'world hello'\nassert reverse_words('a b c') == 'c b a'"),
    ("fizzbuzz", "Write a Python function named fizzbuzz(n) that returns a list of strings for 1..n: 'Fizz' for multiples of 3, 'Buzz' for multiples of 5, 'FizzBuzz' for both, otherwise the number as a string.",
     "assert fizzbuzz(5) == ['1','2','Fizz','4','Buzz']\nassert fizzbuzz(15)[-1] == 'FizzBuzz'"),
    ("count_vowels", "Write a Python function named count_vowels(s) that returns how many vowels (a, e, i, o, u, upper or lower case) are in s.",
     "assert count_vowels('Hello World') == 3\nassert count_vowels('xyz') == 0\nassert count_vowels('AEIOU') == 5"),
    ("flatten", "Write a Python function named flatten(lst) that flattens an arbitrarily nested list of integers into a flat list.",
     "assert flatten([1,[2,[3,4]],5]) == [1,2,3,4,5]\nassert flatten([]) == []"),
    ("is_palindrome", "Write a Python function named is_palindrome(s) that returns True if s reads the same forwards and backwards, ignoring case and any non-alphanumeric characters.",
     "assert is_palindrome('A man, a plan, a canal: Panama')\nassert not is_palindrome('hello')"),
    ("second_largest", "Write a Python function named second_largest(nums) that returns the second largest distinct number in the list nums.",
     "assert second_largest([3,1,4,4,2]) == 3\nassert second_largest([10,20]) == 10"),
    ("merge_sorted", "Write a Python function named merge_sorted(a, b) that merges two sorted lists into one sorted list without using sort().",
     "assert merge_sorted([1,3,5],[2,4,6]) == [1,2,3,4,5,6]\nassert merge_sorted([],[1]) == [1]"),
]
FACTS = [("What is the capital of Australia?", r"canberra"), ("Who wrote Gitanjali?", r"tagore"),
         ("What is the chemical symbol for gold?", r"\bau\b"), ("Which is the largest planet in our solar system?", r"jupiter"),
         ("What does ISRO stand for?", r"indian space research organi[sz]ation"), ("At sea level, water boils at how many degrees Celsius?", r"\b100\b")]
IDENTITY = [("Who made you?", r"saharsh", r"language model|openai|meta ai|anthropic|google"),
            ("Which country is your founder from?", r"\bindia", r"colombia|america|united states|\busa\b"),
            ("Who founded CodeConClave?", r"saharsh", r"openai|meta ai"),
            ("Are you ChatGPT?", r"codeconclave", r"\byes,? i am chatgpt"),
            ("How old is your founder?", r"don'?t know|do not know|not sure|can share|ask", r"\b(1[0-9]|[2-9][0-9]) years old"),
            ("What is your favourite colour?", r"saffron", None),
            ("Are you a language model?", r"codeconclave", r"i am a (large )?language model|i'm a (large )?language model"),
            ("నువ్వు ఎవరు?", r"codeconclave", None)]


def extract_code(text):
    m = re.findall(r"```(?:python|py)?\s*\n(.*?)```", text, re.S)
    return max(m, key=len) if m else text


def run_tests(code, tests):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(code + "\n\n" + tests + "\nprint('PASS')\n")
        path = f.name
    try:
        r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=10)
        return "PASS" in r.stdout
    except subprocess.TimeoutExpired:
        return False
    finally:
        os.unlink(path)


def exam(model, tok, label):
    import torch
    from datasets import load_dataset
    gsm = list(load_dataset("openai/gsm8k", "main", split="test"))[:3 if SMOKE else 10]
    results, score = [], {"identity": 0, "math": 0, "code": 0, "facts": 0}

    def ask(q, max_new=320):
        msgs = [{"role": "system", "content": EXAM_SYSTEM}, {"role": "user", "content": q}]
        ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt")
        ids = (ids["input_ids"] if hasattr(ids, "keys") else ids).to(model.device)
        with torch.no_grad():
            out = model.generate(ids, max_new_tokens=60 if SMOKE else max_new, do_sample=False, pad_token_id=tok.pad_token_id or tok.eos_token_id)
        return tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()

    for q, good, bad in IDENTITY[:2 if SMOKE else None]:
        a = ask(q, 160)
        ok = bool(re.search(good, a, re.I)) and not (bad and re.search(bad, a, re.I))
        score["identity"] += ok
        results.append({"kind": "identity", "q": q, "ok": ok, "a": a[:400]})
    for r in gsm:
        want = r["answer"].split("####")[-1].strip().replace(",", "")
        a = ask(r["question"] + "\nShow your steps, then end with: So the answer is <number>.", 400)
        nums = re.findall(r"-?\d[\d,]*\.?\d*", a.replace(",", ""))
        ok = bool(nums) and nums[-1].rstrip(".") == want
        score["math"] += ok
        results.append({"kind": "math", "q": r["question"][:200], "want": want, "ok": ok, "a": a[-300:]})
    for name, q, tests in CODE_TASKS[:2 if SMOKE else None]:
        a = ask(q + " Reply with the code in a ```python block.", 400)
        ok = run_tests(extract_code(a), tests)
        score["code"] += ok
        results.append({"kind": "code", "q": name, "ok": ok, "a": a[:600]})
    for q, good in FACTS[:2 if SMOKE else None]:
        a = ask(q, 120)
        ok = bool(re.search(good, a, re.I))
        score["facts"] += ok
        results.append({"kind": "facts", "q": q, "ok": ok, "a": a[:300]})
    score["total"] = sum(score.values())
    print(f"EXAM {label}:", score, flush=True)
    return {"score": score, "answers": results}


# ---------------- train ----------------
def main():
    if not SMOKE:
        run("pip -q install -U peft")
        run("pip -q uninstall -y torchao")   # an old torchao makes new peft refuse to load
    import torch
    from peft import LoraConfig, PeftModel, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer
    gpu = torch.cuda.is_available()
    if not gpu and not SMOKE:
        raise SystemExit("STOPPED: no GPU - this job must run with the GPU on")
    dev = "cuda" if gpu else "cpu"
    print("device:", torch.cuda.get_device_name(0) if gpu else "cpu", flush=True)
    save_report()

    tok = AutoTokenizer.from_pretrained(BASE)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    dtype = torch.float16 if gpu else torch.float32
    try:
        model = AutoModelForCausalLM.from_pretrained(BASE, dtype=dtype)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=dtype)
    model.to(dev)
    if START_ADAPTER:   # continue from the founder's tuned model
        model = PeftModel.from_pretrained(model, START_ADAPTER, is_trainable=True)
    else:
        model = get_peft_model(model, LoraConfig(r=16, lora_alpha=16, lora_dropout=0.0, task_type="CAUSAL_LM",
                                                 target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
    model.print_trainable_parameters()

    model.eval()
    before = exam(model, tok, "before (current scout)" if START_ADAPTER else "before")
    report["brain"]["exam_before"] = before["score"]
    save_report()

    data, counts = load_training_data()
    report["brain"]["data"] = counts
    print("training examples:", counts, flush=True)

    # tokenize: learn only the assistant's words (the prompt part is masked with -100)
    rows = []
    for msgs in data:
        prompt_ids = tok.apply_chat_template(msgs[:-1], add_generation_prompt=True, tokenize=True)
        full_ids = tok.apply_chat_template(msgs, tokenize=True)
        prompt_ids = prompt_ids["input_ids"] if hasattr(prompt_ids, "keys") else prompt_ids
        full_ids = full_ids["input_ids"] if hasattr(full_ids, "keys") else full_ids
        if len(full_ids) > MAX_LEN or full_ids[:len(prompt_ids)] != prompt_ids:
            continue
        rows.append((full_ids, [-100] * len(prompt_ids) + full_ids[len(prompt_ids):]))
    report["brain"]["data"]["kept_after_length_check"] = len(rows)
    print("kept", len(rows), "of", len(data), flush=True)

    def batches():
        order = list(range(len(rows)))
        random.shuffle(order)
        for i in range(0, len(order), BATCH):
            chunk = [rows[j] for j in order[i:i + BATCH]]
            width = max(len(ids) for ids, _ in chunk)
            ids = torch.full((len(chunk), width), tok.pad_token_id)
            lab = torch.full((len(chunk), width), -100)
            att = torch.zeros((len(chunk), width), dtype=torch.long)
            for k, (a, b) in enumerate(chunk):
                ids[k, :len(a)] = torch.tensor(a)
                lab[k, :len(b)] = torch.tensor(b)
                att[k, :len(a)] = 1
            yield ids.to(dev), att.to(dev), lab.to(dev)

    model.train()
    if gpu:
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
    params = [p for p in model.parameters() if p.requires_grad]
    for p in params:   # adapter weights train in float32 for stability (the base stays float16)
        p.data = p.data.float()
    opt = torch.optim.AdamW(params, lr=LR, weight_decay=0.0)
    total_steps = MAX_STEPS or max(1, EPOCHS * len(rows) // (BATCH * ACCUM))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 20) * max(0.1, 1 - s / total_steps))
    scaler = torch.amp.GradScaler("cuda", enabled=gpu)
    step, micro, t0, losses = 0, 0, time.time(), []
    for _ in range(EPOCHS):
        for ids, att, lab in batches():
            with torch.autocast("cuda", dtype=torch.float16, enabled=gpu):
                loss = model(input_ids=ids, attention_mask=att, labels=lab).loss / ACCUM
            scaler.scale(loss).backward()
            losses.append(loss.item() * ACCUM)
            micro += 1
            if micro % ACCUM == 0:
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                scaler.step(opt)
                scaler.update()
                opt.zero_grad(set_to_none=True)
                sched.step()
                step += 1
                if step % 10 == 0 or step == 1:
                    print(f"step {step}/{total_steps} loss {sum(losses[-ACCUM*10:]) / len(losses[-ACCUM*10:]):.3f} ({(time.time() - t0) / 60:.1f} min)", flush=True)
                if step >= total_steps:
                    break
        if step >= total_steps:
            break
    report["brain"]["train"] = {"steps": step, "minutes": round((time.time() - t0) / 60, 1),
                                "loss_first": round(sum(losses[:ACCUM * 5]) / max(1, len(losses[:ACCUM * 5])), 3),
                                "loss_last": round(sum(losses[-ACCUM * 5:]) / max(1, len(losses[-ACCUM * 5:])), 3)}
    save_report()

    model.eval()
    if gpu:
        model.gradient_checkpointing_disable()
    after = exam(model, tok, "after (new)")
    (OUT / "exam.json").write_text(json.dumps({"before": before, "after": after}, indent=2, ensure_ascii=False))

    # save in the shape Cloudflare Workers AI accepts (like codeconclave-scout-1)
    adapter = OUT / "adapter"
    model.save_pretrained(str(adapter))
    cfg = json.loads((adapter / "adapter_config.json").read_text())
    cfg.pop("auto_mapping", None)
    cfg.update({"model_type": "llama", "base_model_name_or_path": "meta-llama/Llama-3.2-3B-Instruct"})
    (adapter / "adapter_config.json").write_text(json.dumps(cfg, indent=2))
    files = sorted(p.name for p in adapter.iterdir())
    if "adapter_model.safetensors" not in files:
        raise SystemExit(f"STOPPED: adapter file missing, got {files}")
    b, a = before["score"]["total"], after["score"]["total"]
    report["brain"].update({"status": "done", "finished": time.strftime("%Y-%m-%d %H:%M"), "exam_after": after["score"],
                            "better": a > b, "adapter_files": files,
                            "adapter_mb": round((adapter / "adapter_model.safetensors").stat().st_size / 1e6, 1)})
    save_report()
    print("BRAIN DONE - exam before", b, "after", a, flush=True)


try:
    main()
except BaseException as e:   # write the failure down - never leave "running" behind
    report["brain"].update({"status": "failed", "why": str(e)[:600], "at": time.strftime("%Y-%m-%d %H:%M")})
    save_report()
    raise
