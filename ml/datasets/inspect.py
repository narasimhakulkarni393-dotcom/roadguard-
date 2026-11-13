#!/usr/bin/env python3
"""
Dataset inspection utility for RoadGuard AI.
Provides summary statistics and sample previews of a YOLO-format dataset.

Usage: python -m ml.datasets.inspect --dataset-dir datasets/processed/rdd2022
"""
import argparse
import json
from pathlib import Path
from collections import Counter

RDD2022_CLASSES = {
    0: "D00_Longitudinal_Crack",
    1: "D10_Transverse_Crack",
    2: "D20_Alligator_Crack",
    3: "D40_Pothole"
}


def inspect_dataset(dataset_dir: str) -> dict:
    """Inspect a YOLO-format dataset and return statistics."""
    base = Path(dataset_dir)
    images_dir = base / "images"
    labels_dir = base / "labels"

    splits = {}
    for split in ["train", "val", "test"]:
        split_images = images_dir / split
        split_labels = labels_dir / split
        if not split_images.exists():
            continue
        img_files = [f for f in split_images.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}]
        class_counts: Counter = Counter()
        total_boxes = 0
        for img in img_files:
            lbl = split_labels / img.relative_to(split_images).with_suffix(".txt")
            if lbl.exists():
                with open(lbl) as f:
                    for line in f:
                        parts = line.strip().split()
                        if parts:
                            cid = int(parts[0])
                            class_counts[RDD2022_CLASSES.get(cid, f"class_{cid}")] += 1
                            total_boxes += 1
        splits[split] = {
            "images": len(img_files),
            "total_boxes": total_boxes,
            "class_distribution": dict(class_counts)
        }

    return {"dataset_dir": str(base), "splits": splits}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect a YOLO dataset")
    parser.add_argument("--dataset-dir", required=True, help="Path to processed YOLO dataset")
    args = parser.parse_args()
    result = inspect_dataset(args.dataset_dir)
    print(json.dumps(result, indent=2))
