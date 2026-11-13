#!/usr/bin/env python3
"""
Dataset validation for RoadGuard AI.
Checks images and YOLO annotations for integrity.

Usage: python -m ml.datasets.validate --dataset-dir datasets/processed/rdd2022
"""
import os
import sys
import json
import hashlib
from pathlib import Path
from PIL import Image
import argparse

RDD2022_CLASSES = {
    0: "D00_Longitudinal_Crack",
    1: "D10_Transverse_Crack",
    2: "D20_Alligator_Crack",
    3: "D40_Pothole"
}


def validate_yolo_annotation(label_path, class_count=4):
    """Validate a YOLO format annotation file."""
    errors = []
    with open(label_path) as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 5:
                errors.append(f"Line {line_num}: expected 5 values, got {len(parts)}")
                continue
            class_id = int(parts[0])
            if class_id < 0 or class_id >= class_count:
                errors.append(f"Line {line_num}: invalid class_id {class_id}")
            coords = [float(x) for x in parts[1:]]
            for i, c in enumerate(coords):
                if not (0.0 <= c <= 1.0):
                    errors.append(f"Line {line_num}: coord {i} out of range: {c}")
    return errors


def validate_dataset(dataset_dir, annotation_format="yolo"):
    """Validate entire dataset directory."""
    dataset_dir = Path(dataset_dir)
    images_dir = dataset_dir / "images"
    labels_dir = dataset_dir / "labels"

    results = {
        "total_images": 0,
        "valid_images": 0,
        "corrupted_images": [],
        "total_annotations": 0,
        "annotation_errors": [],
        "class_distribution": {v: 0 for v in RDD2022_CLASSES.values()},
        "unannotated_images": []
    }

    if not images_dir.exists():
        print(f"Images directory not found: {images_dir}")
        return results

    for img_path in images_dir.rglob("*"):
        if img_path.suffix.lower() not in [".jpg", ".jpeg", ".png", ".bmp"]:
            continue
        results["total_images"] += 1

        # Validate image
        try:
            img = Image.open(img_path)
            img.verify()
            results["valid_images"] += 1
        except Exception as e:
            results["corrupted_images"].append(str(img_path))
            continue

        # Find annotation
        label_path = labels_dir / img_path.relative_to(images_dir).with_suffix(".txt")
        if not label_path.exists():
            results["unannotated_images"].append(str(img_path))
            continue

        results["total_annotations"] += 1
        errors = validate_yolo_annotation(label_path)
        if errors:
            results["annotation_errors"].append({"file": str(label_path), "errors": errors})
        else:
            with open(label_path) as f:
                for line in f:
                    parts = line.strip().split()
                    if parts:
                        class_id = int(parts[0])
                        class_name = RDD2022_CLASSES.get(class_id, f"unknown_{class_id}")
                        results["class_distribution"][class_name] = results["class_distribution"].get(class_name, 0) + 1

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    args = parser.parse_args()
    results = validate_dataset(args.dataset_dir)
    print(json.dumps(results, indent=2))
