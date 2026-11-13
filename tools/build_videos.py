#!/usr/bin/env python3
"""Copy the lesson videos into the drill, small enough to stream on a phone.

    python3 tools/build_videos.py                        # from ../skm-videos/videos (the Japanese 26 workspace)
    python3 tools/build_videos.py --src DIR              # from somewhere else
    python3 tools/build_videos.py --force                # remake every file

The source videos are narrated slide explainers, one per 第2部 and 第3部 lesson of 新完全マスター N2 文法,
made outside this repo (skm-videos/ in the Japanese 26 workspace). Each source file name starts with its
number: 01 to 03 are 第2部 1課 to 3課 (points P2-1 to P2-3), 04 to 15 are 第3部 1課 to 12課 (P3-1 to P3-12).

For each one this writes video/<point>.mp4 (720p, 10 frames a second, H.264 tuned for still pictures,
mono AAC at 40 kbps: about 0.55 MB a minute) and video/<point>.jpg (a 640 x 360 poster from the title
slide), and records its length, size and a hash in content/videos.json. A file is remade only when its
source changed. Then run `node tools/bundle.mjs` so the app knows about it.
Needs ffmpeg and ffprobe.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "video")
INDEX = os.path.join(ROOT, "content", "videos.json")
DEFAULT_SRC = os.path.join(ROOT, "..", "skm-videos", "videos")


def point_of(n):
    """Source number (1 to 15) to the drill's point id."""
    return f"P2-{n}" if n <= 3 else f"P3-{n - 3}"


def sha(path, n=16):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:n]


def length(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def encode(src, mp4, jpg):
    tmp = mp4 + ".part.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", src,
        "-vf", "scale=1280:720:flags=lanczos,fps=10",
        "-c:v", "libx264", "-preset", "veryslow", "-tune", "stillimage", "-crf", "26", "-g", "100", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-ar", "24000",
        "-movflags", "+faststart", tmp,
    ], check=True)
    os.replace(tmp, mp4)
    # The title slide is up from the start; 2 s in, its build steps have all appeared.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2", "-i", mp4, "-frames:v", "1", "-vf", "scale=640:360:flags=lanczos", "-q:v", "4", jpg], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if not os.path.isdir(args.src):
        sys.exit(f"No source folder at {args.src}. Pass --src.")
    os.makedirs(OUT, exist_ok=True)
    index = json.load(open(INDEX, encoding="utf8")) if os.path.exists(INDEX) else {}
    for name in sorted(os.listdir(args.src)):
        m = re.match(r"(\d\d)_.*\.mp4$", name)
        if not m or not 1 <= int(m.group(1)) <= 15:
            continue
        pid = point_of(int(m.group(1)))
        src = os.path.join(args.src, name)
        mp4 = os.path.join(OUT, f"{pid}.mp4")
        jpg = os.path.join(OUT, f"{pid}.jpg")
        src_hash = sha(src)
        old = index.get(pid, {})
        if not args.force and old.get("src") == src_hash and os.path.exists(mp4) and os.path.exists(jpg):
            print(f"  {pid} unchanged")
            continue
        encode(src, mp4, jpg)
        index[pid] = {"secs": round(length(mp4), 1), "mb": round(os.path.getsize(mp4) / 1e6, 1), "h": sha(mp4, 8), "src": src_hash}
        print(f"✓ {pid} {index[pid]['secs'] / 60:.1f} min · {index[pid]['mb']} MB  ({name})", flush=True)
    index = dict(sorted(index.items(), key=lambda kv: (kv[0][:2], int(kv[0].split("-")[1]))))
    with open(INDEX, "w", encoding="utf8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")
    total = sum(v["mb"] for v in index.values())
    print(f"{len(index)} videos · {sum(v['secs'] for v in index.values()) / 60:.0f} min · {total:.0f} MB in video/")


if __name__ == "__main__":
    main()
