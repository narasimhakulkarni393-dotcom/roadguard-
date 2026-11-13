#!/usr/bin/env python3
"""
Authenticity dataset preparation for RoadGuard AI.
Organizes images into natural/ and ai_generated/ classes for training.

Expected input structure:
  raw/authenticity/
    natural/      ← real road damage photos
    ai_generated/ ← AI-generated/synthetic images

Output structure (ImageFolder compatible):
  processed/authenticity/
    train/
      natural/
      ai_generated/
    val/
      natural/
      ai_generated/
    test/
      natural/
      ai_generated/

Usage: python -m ml.authenticity.prepare --input datasets/raw/authenticity --output datasets/processed/authenticity
"""
import argparse
import random
import shutil
from pathlib import Path

CLASSES = ["natural", "ai_generated"]
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def prepare(input_dir, output_dir, train=0.8, val=0.1, test=0.1, seed=42):
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    random.seed(seed)

    for cls in CLASSES:
        cls_dir = input_dir / cls
        if not cls_dir.exists():
            print(f"WARNING: Class directory not found: {cls_dir}")
            continue

        images = [f for f in cls_dir.rglob("*") if f.suffix.lower() in IMG_EXTS]
        random.shuffle(images)

        n = len(images)
        n_train = int(n * train)
        n_val = int(n * val)

        splits = {
            "train": images[:n_train],
            "val": images[n_train:n_train + n_val],
            "test": images[n_train + n_val:]
        }

        for split_name, imgs in splits.items():
            out = output_dir / split_name / cls
            out.mkdir(parents=True, exist_ok=True)
            for img in imgs:
                shutil.copy2(img, out / img.name)
            print(f"  {cls}/{split_name}: {len(imgs)} images")

    print(f"Authenticity dataset prepared at: {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--train", type=float, default=0.8)
    parser.add_argument("--val", type=float, default=0.1)
    parser.add_argument("--test", type=float, default=0.1)
    args = parser.parse_args()
    prepare(args.input, args.output, args.train, args.val, args.test)
