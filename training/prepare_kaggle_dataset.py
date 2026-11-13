#!/usr/bin/env python3
"""Prepare the Kaggle road-damage dataset for YOLO training.

Resolves lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes via
kagglehub (public download, no credentials), validates every annotation, builds a
seeded stratified train/val/test split, and writes dataset.yaml plus a provenance
manifest.

Classes (as published by the dataset):
    0 pothole
    1 crack
    2 manhole

The backend maps these raw labels onto its six-class taxonomy; crack subtype and
manhole-vs-open-sewage are inferred heuristically at inference time, not learned.

Usage:
    python -m training.prepare_kaggle_dataset
    python -m training.prepare_kaggle_dataset --output datasets/processed/kaggle_road_damage --seed 42
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

DATASET_SLUG = "lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes"
CLASS_NAMES = {0: "pothole", 1: "crack", 2: "manhole"}
CITATION = "https://doi.org/10.5281/zenodo.17834373"


def resolve_source() -> tuple[Path, str]:
    try:
        import kagglehub
    except ImportError:
        sys.exit("kagglehub is not installed: python -m pip install kagglehub")

    root = Path(kagglehub.dataset_download(DATASET_SLUG))
    version = root.name
    data_dir = root / "data" if (root / "data").is_dir() else root
    return data_dir, version


def parse_label(path: Path) -> tuple[list[tuple[int, float, float, float, float]], int]:
    """Return (valid boxes, malformed line count) for one YOLO label file."""
    boxes: list[tuple[int, float, float, float, float]] = []
    malformed = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if not parts:
            continue
        if len(parts) != 5:
            malformed += 1
            continue
        try:
            cls = int(float(parts[0]))
            xc, yc, w, h = (float(v) for v in parts[1:])
        except ValueError:
            malformed += 1
            continue
        if cls not in CLASS_NAMES or not all(0.0 <= v <= 1.0 for v in (xc, yc, w, h)) or w <= 0 or h <= 0:
            malformed += 1
            continue
        if xc - w / 2 < -0.01 or xc + w / 2 > 1.01 or yc - h / 2 < -0.01 or yc + h / 2 > 1.01:
            malformed += 1
            continue
        boxes.append((cls, xc, yc, w, h))
    return boxes, malformed


def stratified_split(
    samples: list[tuple[Path, Path, list[tuple[int, float, float, float, float]]]],
    seed: int,
    train_frac: float,
    val_frac: float,
    test_frac: float,
) -> dict[str, list[tuple[Path, Path, list[tuple[int, float, float, float, float]]]]]:
    if abs(train_frac + val_frac + test_frac - 1.0) > 1e-6:
        sys.exit("Split fractions must sum to 1.0")

    rng = random.Random(seed)
    by_dominant: dict[int, list] = defaultdict(list)
    for sample in samples:
        counts = Counter(box[0] for box in sample[2])
        by_dominant[counts.most_common(1)[0][0]].append(sample)

    splits: dict[str, list] = {"train": [], "val": [], "test": []}
    for cls in sorted(by_dominant):
        group = by_dominant[cls]
        rng.shuffle(group)
        n = len(group)
        n_test = max(1, round(n * test_frac))
        n_val = max(1, round(n * val_frac))
        if n_test + n_val >= n:
            n_test = max(1, n // 10)
            n_val = max(1, n // 10)
        splits["test"].extend(group[:n_test])
        splits["val"].extend(group[n_test : n_test + n_val])
        splits["train"].extend(group[n_test + n_val :])

    for name in splits:
        rng.shuffle(splits[name])
    return splits


def sha256_file(path: Path, limit: int | None = None) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        remaining = limit
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            if remaining is not None:
                chunk = chunk[:remaining]
                remaining -= len(chunk)
            digest.update(chunk)
            if remaining == 0:
                break
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare the Kaggle road-damage dataset for YOLO training")
    parser.add_argument("--output", default="datasets/processed/kaggle_road_damage")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-frac", type=float, default=0.8)
    parser.add_argument("--val-frac", type=float, default=0.1)
    parser.add_argument("--test-frac", type=float, default=0.1)
    parser.add_argument("--force", action="store_true", help="Rebuild an existing output directory")
    args = parser.parse_args()

    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()) and not args.force:
        sys.exit(f"{output} already exists. Re-run with --force to rebuild.")

    print(">>> Resolving dataset via kagglehub ...")
    source, version = resolve_source()
    print(f"    source: {source}")

    image_dir = source / "images"
    label_dir = source / "labels-YOLO"
    if not image_dir.is_dir() or not label_dir.is_dir():
        sys.exit(f"Unexpected dataset layout under {source}")

    images = sorted(image_dir.glob("*.jpg"))
    if not images:
        sys.exit("No .jpg images found in the dataset")

    samples = []
    class_instances: Counter[int] = Counter()
    missing_labels = 0
    empty_labels = 0
    malformed_total = 0
    for image in images:
        label = label_dir / f"{image.stem}.txt"
        if not label.exists():
            missing_labels += 1
            continue
        boxes, malformed = parse_label(label)
        malformed_total += malformed
        if not boxes:
            empty_labels += 1
            continue
        class_instances.update(box[0] for box in boxes)
        samples.append((image, label, boxes))

    print(f"    images: {len(images)}  usable: {len(samples)}  missing labels: {missing_labels} "
          f"empty labels: {empty_labels}  malformed lines: {malformed_total}")
    print(f"    instances: {dict(sorted(class_instances.items()))}")
    if not samples:
        sys.exit("No usable image/label pairs found")

    splits = stratified_split(samples, args.seed, args.train_frac, args.val_frac, args.test_frac)

    if output.exists():
        shutil.rmtree(output)
    for split in ("train", "val", "test"):
        (output / "images" / split).mkdir(parents=True, exist_ok=True)
        (output / "labels" / split).mkdir(parents=True, exist_ok=True)
        for image, label, _ in splits[split]:
            shutil.copy2(image, output / "images" / split / image.name)
            shutil.copy2(label, output / "labels" / split / label.name)

    import yaml

    dataset_yaml = {
        "path": str(output).replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": len(CLASS_NAMES),
        "names": CLASS_NAMES,
    }
    with open(output / "dataset.yaml", "w", encoding="utf-8") as fh:
        yaml.safe_dump(dataset_yaml, fh, sort_keys=False, allow_unicode=True)

    split_stats = {}
    for split in ("train", "val", "test"):
        counts: Counter[int] = Counter()
        for _, _, boxes in splits[split]:
            counts.update(box[0] for box in boxes)
        split_stats[split] = {
            "images": len(splits[split]),
            "instances": {CLASS_NAMES[k]: counts.get(k, 0) for k in CLASS_NAMES},
        }

    coco_path = source / "annotations_coco.json"
    manifest = {
        "dataset": DATASET_SLUG,
        "resolved_version": version,
        "resolved_path": str(source),
        "citation": CITATION,
        "license": "MIT (per Kaggle dataset metadata)",
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "prepared_by": "training/prepare_kaggle_dataset.py",
        "classes": list(CLASS_NAMES.values()),
        "seed": args.seed,
        "fractions": {"train": args.train_frac, "val": args.val_frac, "test": args.test_frac},
        "source_counts": {
            "images": len(images),
            "usable_pairs": len(samples),
            "missing_labels": missing_labels,
            "empty_labels": empty_labels,
            "malformed_lines": malformed_total,
            "class_instances": {CLASS_NAMES[k]: v for k, v in sorted(class_instances.items())},
        },
        "splits": split_stats,
        "annotation_fingerprint": sha256_file(coco_path) if coco_path.exists() else None,
        "notes": [
            "Test split is held out from training and used once for final evaluation.",
            "The dataset labels cracks and manholes as single classes; the backend refines "
            "crack subtype and manhole-vs-open-sewage heuristically at inference time.",
        ],
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f">>> Wrote {output / 'dataset.yaml'}")
    print(f">>> Wrote {manifest_path}")
    for split, stats in split_stats.items():
        print(f"    {split}: {stats['images']} images, {stats['instances']}")


if __name__ == "__main__":
    main()
