#!/usr/bin/env python3
"""Make the listening audio (聴解) from the scripts in content/listen_*.json.

Uses Google's Gemini speech model, either through OpenRouter or straight from Google.
The key comes from the environment; OpenRouter is used when its key is set:

    OPENROUTER_API_KEY=... python3 tools/build_audio.py        # make audio for new or changed items
    GEMINI_API_KEY=... python3 tools/build_audio.py --check    # also transcribe each file and flag misreadings
    python3 tools/build_audio.py --only l4-003 l4-004          # just these items
    python3 tools/build_audio.py --via gemini                  # use Google even if both keys are set

Writes audio/<id>.m4a and content/audio.json (length, voices and the order the choices are read in).
Each spoken piece is cached in tools/.audio_cache/ by its text and voice, so a rerun only pays for what changed.
Needs ffmpeg. No packages beyond the standard library.

How an item sounds, as on the paper:
  l1, l2  narrator: setup + question · dialogue · narrator: question again
  l3      narrator: setup · talk · narrator: question · narrator reads the four choices
  l4      one line · the other speaker reads the three replies, numbered
  l5      narrator: setup · talk · one question with four spoken choices, or 質問1 and 質問2 (printed choices)
"""
import argparse
import base64
import concurrent.futures as cf
import difflib
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
AUDIO = os.path.join(ROOT, "audio")
CACHE = os.path.join(ROOT, "tools", ".audio_cache")
MANIFEST = os.path.join(CONTENT, "audio.json")

TTS_MODEL = "gemini-3.8-flash-tts"
ASR_MODEL = "gemini-2.5-flash"
API = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
OR_API = "https://openrouter.ai/api/v1"  # same Gemini models, named "google/<model>"
RATE = 24000  # the model returns 24 kHz, 16-bit mono

NARRATOR = "Erinome"
WOMEN = ["Kore", "Aoede", "Leda", "Sulafat", "Despina"]
MEN = ["Charon", "Iapetus", "Puck", "Orus", "Achird"]
NUMS = ["いち", "に", "さん", "よん"]


KEYS = {"openrouter": "OPENROUTER_API_KEY", "gemini": "GEMINI_API_KEY"}
VIA = None  # set in main()


def key():
    return os.environ.get(KEYS[VIA], "").strip()


def pick_via(want):
    if want:
        if not os.environ.get(KEYS[want], "").strip():
            sys.exit(f"Set {KEYS[want]} first.")
        return want
    for via, name in KEYS.items():
        if os.environ.get(name, "").strip():
            return via
    sys.exit("Set OPENROUTER_API_KEY or GEMINI_API_KEY first.")


def id_hash(s):
    # Same as idHash in js/app.js, so both agree on the order spoken choices are read in.
    return sum(ord(ch) * (i + 1) for i, ch in enumerate(s))


def spoken_order(item_id, n):
    """Display position -> index in c. The right answer (c[0]) lands at position id_hash % n."""
    p = id_hash(item_id) % n
    rest = list(range(1, n))
    return rest[:p] + [0] + rest[p:]


def voices_for(item):
    h = id_hash(item["id"])
    f, m = h % len(WOMEN), (h // 7) % len(MEN)
    return {"F": WOMEN[f], "F2": WOMEN[(f + 2) % len(WOMEN)], "M": MEN[m], "M2": MEN[(m + 2) % len(MEN)]}


def spoken(line):
    return (line.get("say") or line["t"]).strip()


# ---------- the speech model ----------
def post(url, body, headers, tries=6):
    """POST JSON, retrying rate limits and server errors. Returns the raw response bytes."""
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    wait = 5
    for n in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode("utf8", "replace")
            # OpenRouter answers 402 "in_flight_budget_exhausted" when parallel calls reserve the whole balance; it clears on its own.
            busy = e.code == 402 and "in_flight" in msg
            if (e.code in (429, 500, 502, 503, 504) or busy) and n < tries - 1:
                time.sleep(wait)
                wait = min(wait * 2, 90)
                continue
            raise RuntimeError(f"HTTP {e.code}: {msg}")
        except (urllib.error.URLError, TimeoutError) as e:
            if n < tries - 1:
                time.sleep(wait)
                wait = min(wait * 2, 90)
                continue
            raise RuntimeError(str(e))


def call(body, model=TTS_MODEL):
    """Google's own API."""
    return json.loads(post(API.format(model), body, {"x-goog-api-key": key()}))


def call_or(path, body):
    """OpenRouter."""
    return post(OR_API + path, body, {"Authorization": "Bearer " + key()})


def as_pcm(raw):
    """Raw 16-bit PCM, unwrapping a WAV header if there is one."""
    if raw[:4] == b"RIFF":
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            f.write(raw)
            f.flush()
            with wave.open(f.name) as w:
                assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, "unexpected audio format"
                raw = w.readframes(w.getnframes())
    return raw


def pcm_of(resp):
    """The audio bytes from Google's JSON reply (the model sends WAV or bare PCM)."""
    parts = resp["candidates"][0]["content"]["parts"]
    out = b"".join(as_pcm(base64.b64decode(p["inlineData"]["data"])) for p in parts if "inlineData" in p)
    if not out:
        raise RuntimeError("no audio in the response")
    return out


def tts(parts, voices, labels):
    """One speech call. One label: a single voice. Two: a conversation."""
    if VIA == "openrouter":
        body = {"model": "google/" + TTS_MODEL, "voice": voices[labels[0]], "response_format": "pcm"}
        if len(labels) == 1:
            body["input"] = "\n".join(t for _, t in parts)
        else:
            body["input"] = [{"text": t, "voice": voices[lab]} for lab, t in parts]
        pcm = as_pcm(call_or("/audio/speech", body))
        if len(pcm) < RATE // 10 or pcm[:1] in (b"{", b"<"):
            raise RuntimeError("no audio in the response: " + pcm[:200].decode("utf8", "replace"))
        return pcm
    if len(labels) == 1:
        body = {
            "contents": [{"role": "user", "parts": [{"text": "\n".join(t for _, t in parts)}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voices[labels[0]]}}}},
        }
    else:
        body = {
            "contents": [{"role": "user", "parts": [{"text": t, "speechMetadata": {"speaker": lab}} for lab, t in parts]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"multiSpeakerVoiceConfig": {"speakerVoiceConfigs": [
                {"speaker": lab, "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voices[lab]}}} for lab in labels]}}},
        }
    return pcm_of(call(body))


def speak(parts, voices):
    """parts: [(label, text)]. One label: a single voice. Two: a conversation. Cached by content."""
    labels = sorted({lab for lab, _ in parts})
    sig = json.dumps([TTS_MODEL, parts, {lab: voices[lab] for lab in labels}], ensure_ascii=False)
    path = os.path.join(CACHE, hashlib.sha1(sig.encode()).hexdigest() + ".pcm")
    if os.path.exists(path):
        return open(path, "rb").read()
    pcm = tts(parts, voices, labels)
    os.makedirs(CACHE, exist_ok=True)
    with open(path + ".tmp", "wb") as f:
        f.write(pcm)
    os.replace(path + ".tmp", path)
    return pcm


def silence(secs):
    return b"\x00\x00" * int(RATE * secs)


def talk(lines, voices):
    """The dialogue or talk. Up to two speakers go in one call, so turns flow; three or more go line by line."""
    who = {l["sp"] for l in lines}
    if len(who) <= 2:
        return speak([(l["sp"], spoken(l)) for l in lines], voices)
    out = b""
    for i, l in enumerate(lines):
        out += (silence(0.35) if i else b"") + speak([(l["sp"], spoken(l))], voices)
    return out


def narr(text):
    return speak([("N", text)], {"N": NARRATOR})


def item_pcm(it):
    v = voices_for(it)
    t = it["type"]
    if t == "l4":
        line = it["lines"][0]
        other = "M" if line["sp"].startswith("F") else "F"
        order = spoken_order(it["id"], 3)
        replies = "\n".join(f"{NUMS[d]}。{it['c'][o]}" for d, o in enumerate(order))
        return speak([(line["sp"], spoken(line))], v) + silence(0.9) + speak([(other, replies)], v), order
    pcm = narr(it["setup"] + ("\n" + it["q"] if t in ("l1", "l2") else ""))
    pcm += silence(0.9) + talk(it["lines"], v) + silence(1.3)
    order = None
    if t in ("l1", "l2"):
        pcm += narr(it["q"])
    elif t == "l3":
        order = spoken_order(it["id"], 4)
        pcm += narr(it["q"]) + silence(0.8) + narr("\n".join(f"{NUMS[d]}。{it['c'][o]}" for d, o in enumerate(order)))
    else:  # l5
        qs = it["qs"]
        if len(qs) == 1:
            order = spoken_order(it["id"], 4)
            pcm += narr(qs[0]["q"]) + silence(0.8) + narr("\n".join(f"{NUMS[d]}。{qs[0]['c'][o]}" for d, o in enumerate(order)))
        else:
            for k, q in enumerate(qs):
                text = q["q"] if q["q"].startswith("質問") else f"質問{k + 1}。{q['q']}"
                pcm += (silence(1.2) if k else b"") + narr(text)
    return pcm, order


def script_of(it):
    """What should be heard, for the transcription check (the narrator's lines are left out).
    Uses the written text, not the kana in "say", because the transcript comes back in kanji."""
    return "".join(l["t"].strip() for l in it["lines"])


def encode(pcm, out):
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        with wave.open(f.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(silence(0.3) + pcm + silence(0.5))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-ar", str(RATE), "-ac", "1", "-c:a", "aac", "-b:a", "40k", out], check=True)


def item_hash(it):
    keep = {k: it.get(k) for k in ("type", "setup", "q", "lines", "c", "qs")}
    if keep.get("qs"):
        keep["qs"] = [{"q": q["q"], "c": q["c"]} for q in keep["qs"]]
    return hashlib.sha1(json.dumps([TTS_MODEL, NARRATOR, WOMEN, MEN, keep], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]


# ---------- transcription check ----------
NORM = re.compile(r"[\s、。，．・「」『』（）()！？!?…ー〜~　,.:：;；\-]")


ASK = "Transcribe this Japanese audio exactly as spoken, in normal Japanese script (kanji and kana). Output only the transcript."


def transcribe(path):
    data = base64.b64encode(open(path, "rb").read()).decode()
    if VIA == "openrouter":
        body = {
            "model": "google/" + ASR_MODEL,
            "messages": [{"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": data, "format": "m4a"}}, {"type": "text", "text": ASK}]}],
            "temperature": 0,
            "reasoning": {"enabled": False},
        }
        return json.loads(call_or("/chat/completions", body))["choices"][0]["message"]["content"]
    body = {
        "contents": [{"role": "user", "parts": [{"inlineData": {"mimeType": "audio/mp4", "data": data}}, {"text": ASK}]}],
        "generationConfig": {"temperature": 0, "thinkingConfig": {"thinkingBudget": 0}},
    }
    return call(body, model=ASR_MODEL)["candidates"][0]["content"]["parts"][0]["text"]


def similarity(want, got):
    a, b = NORM.sub("", want), NORM.sub("", got)
    # The transcript also holds the narrator's lines; score how much of the script was heard, in order.
    m = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return sum(x.size for x in m.get_matching_blocks()) / max(1, len(a))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true", help="remake files even if unchanged")
    ap.add_argument("--check", action="store_true", help="transcribe each file and flag low matches")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--via", choices=sorted(KEYS), help="which service to call (default: OpenRouter if its key is set)")
    args = ap.parse_args()
    global VIA
    VIA = pick_via(args.via)
    print(f"Using {VIA} ({KEYS[VIA]})")

    items = []
    for f in sorted(glob.glob(os.path.join(CONTENT, "listen_*.json"))):
        try:
            items += json.load(open(f, encoding="utf8"))
        except ValueError as e:
            print(f"Skipping {os.path.basename(f)}: not valid JSON ({e})")
    if args.only:
        items = [it for it in items if it["id"] in args.only]
    man = json.load(open(MANIFEST, encoding="utf8")) if os.path.exists(MANIFEST) else {}
    os.makedirs(AUDIO, exist_ok=True)

    todo = [it for it in items if args.force or man.get(it["id"], {}).get("h") != item_hash(it) or not os.path.exists(os.path.join(AUDIO, it["id"] + ".m4a"))]
    print(f"{len(items)} items, {len(todo)} to make")

    def make(it):
        pcm, order = item_pcm(it)
        out = os.path.join(AUDIO, it["id"] + ".m4a")
        encode(pcm, out)
        rec = {"secs": round(len(pcm) / (2 * RATE), 1), "h": item_hash(it), "voices": voices_for(it)}
        if order:
            rec["order"] = order
        return it["id"], rec

    failed = []
    with cf.ThreadPoolExecutor(max_workers=args.jobs) as ex:
        futs = {ex.submit(make, it): it["id"] for it in todo}
        for n, fut in enumerate(cf.as_completed(futs), 1):
            iid = futs[fut]
            try:
                iid, rec = fut.result()
                man[iid] = rec
                print(f"  [{n}/{len(todo)}] {iid} {rec['secs']} s")
            except Exception as e:  # keep going; report at the end
                failed.append(iid)
                print(f"  [{n}/{len(todo)}] {iid} FAILED: {e}")
            if n % 10 == 0:
                json.dump(dict(sorted(man.items())), open(MANIFEST, "w", encoding="utf8"), ensure_ascii=False, indent=1)

    # Drop entries for items that no longer exist.
    ids = {it["id"] for it in items} if not args.only else None
    if ids is not None:
        man = {k: v for k, v in man.items() if k in ids}
    json.dump(dict(sorted(man.items())), open(MANIFEST, "w", encoding="utf8"), ensure_ascii=False, indent=1)

    if args.check:
        print("Checking: transcribing each file")
        low = []

        def chk(it):
            got = transcribe(os.path.join(AUDIO, it["id"] + ".m4a"))
            return it["id"], similarity(script_of(it), got), got

        targets = [it for it in items if it["id"] in man]
        with cf.ThreadPoolExecutor(max_workers=args.jobs) as ex:
            for iid, score, got in ex.map(chk, targets):
                man[iid]["heard"] = round(score, 3)
                if score < 0.9:
                    low.append((iid, score, got))
        json.dump(dict(sorted(man.items())), open(MANIFEST, "w", encoding="utf8"), ensure_ascii=False, indent=1)
        for iid, score, got in sorted(low, key=lambda x: x[1]):
            print(f"  LOW {iid} {score:.2f}: {got[:160]}")
        print(f"  {len(targets) - len(low)}/{len(targets)} heard at 90% or better")

    total = sum(r["secs"] for r in man.values())
    print(f"Done. {len(man)} files, {total / 60:.0f} min of audio." + (f" Failed: {' '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
