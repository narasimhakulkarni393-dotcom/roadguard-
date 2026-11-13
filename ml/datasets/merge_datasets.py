#!/usr/bin/env python3
"""
Merge multiple YOLO datasets into one unified dataset.
Useful for combining RDD2022 country subsets or multiple sources.

Usage:
    python -m ml.datasets.merge_datasets \
        --inputs datasets/processed/rdd2022_japan datasets/processed/rdd2022_india \
        --output datasets/processed/rdd2022_merged \
        --train-split 0.8 --val-split 0.1 --test-split 0.1
"""
import argparse
import shutil
import random
from pathlib import Path


def collect_pairs(dataset_dir: Path):
    """Return (image_path, label_path) pairs for a dataset directory."""
    images_root = dataset_dir / "images"
    labels_root = dataset_dir / "labels"
    pairs = []
    for split in ["train", "val", "test", ""]:
        img_dir = images_root / split if split else images_root
        lbl_dir = labels_root / split if split else labels_root
        if not img_dir.exists():
            continue
        for img in img_dir.rglob("*"):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp"}:
                continue
            lbl = lbl_dir / img.relative_to(img_dir).with_suffix(".txt")
            if lbl.exists():
                pairs.append((img, lbl))
    return pairs


def merge_datasets(inputs, output_dir, train_split=0.8, val_split=0.1, test_split=0.1, seed=42):
    output_dir = Path(output_dir)
    all_pairs = []
    for inp in inputs:
        pairs = collect_pairs(Path(inp))
        print(f"  {inp}: {len(pairs)} image-label pairs")
        all_pairs.extend(pairs)

    random.seed(seed)
    random.shuffle(all_pairs)

    n = len(all_pairs)
    n_train = int(n * train_split)
    n_val = int(n * val_split)

    splits = {
        "train": all_pairs[:n_train],
        "val": all_pairs[n_train:n_train + n_val],
        "test": all_pairs[n_train + n_val:]
    }

    for split, pairs in splits.items():
        img_out = output_dir / "images" / split
        lbl_out = output_dir / "labels" / split
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)
        for i, (img, lbl) in enumerate(pairs):
            stem = f"{split}_{i:06d}"
            shutil.copy2(img, img_out / (stem + img.suffix))
            shutil.copy2(lbl, lbl_out / (stem + ".txt"))
        print(f"  {split}: {len(pairs)} pairs")

    print(f"Merged dataset written to: {output_dir}")
    return {s: len(p) for s, p in splits.items()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--train-split", type=float, default=0.8)
    parser.add_argument("--val-split", type=float, default=0.1)
    parser.add_argument("--test-split", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    merge_datasets(args.inputs, args.output, args.train_split, args.val_split, args.test_split, args.seed)
