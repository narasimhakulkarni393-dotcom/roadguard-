#!/usr/bin/env python3
"""
Split a flat YOLO dataset into train/val/test splits.

Usage:
    python -m ml.datasets.split_dataset \
        --input datasets/processed/rdd2022_flat \
        --output datasets/processed/rdd2022 \
        --train 0.8 --val 0.1 --test 0.1
"""
import argparse
import random
import shutil
from pathlib import Path


def split_dataset(input_dir, output_dir, train=0.8, val=0.1, test=0.1, seed=42):
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)

    images_dir = input_dir / "images"
    labels_dir = input_dir / "labels"

    if not images_dir.exists():
        print(f"No images/ directory found in {input_dir}")
        return

    all_images = [f for f in images_dir.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}]
    random.seed(seed)
    random.shuffle(all_images)

    n = len(all_images)
    n_train = int(n * train)
    n_val = int(n * val)

    splits = {
        "train": all_images[:n_train],
        "val": all_images[n_train:n_train + n_val],
        "test": all_images[n_train + n_val:]
    }

    for split_name, imgs in splits.items():
        img_out = output_dir / "images" / split_name
        lbl_out = output_dir / "labels" / split_name
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img_path in imgs:
            shutil.copy2(img_path, img_out / img_path.name)
            lbl_path = labels_dir / img_path.relative_to(images_dir).with_suffix(".txt")
            if lbl_path.exists():
                shutil.copy2(lbl_path, lbl_out / lbl_path.name)

        print(f"{split_name}: {len(imgs)} images")

    print(f"Dataset split complete: {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--train", type=float, default=0.8)
    parser.add_argument("--val", type=float, default=0.1)
    parser.add_argument("--test", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    split_dataset(args.input, args.output, args.train, args.val, args.test, args.seed)
