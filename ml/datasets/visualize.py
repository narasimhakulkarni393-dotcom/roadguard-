#!/usr/bin/env python3
"""
Visualize YOLO annotations overlaid on images.
Draws bounding boxes with class labels for inspection.

Usage:
    python -m ml.datasets.visualize --dataset-dir datasets/processed/rdd2022 --split train --count 5
"""
import argparse
import random
from pathlib import Path

RDD2022_CLASSES = {
    0: "D00_Longitudinal_Crack",
    1: "D10_Transverse_Crack",
    2: "D20_Alligator_Crack",
    3: "D40_Pothole"
}

COLORS = {
    0: (255, 0, 0),    # Red
    1: (0, 255, 0),    # Green
    2: (0, 0, 255),    # Blue
    3: (255, 165, 0),  # Orange
}


def draw_annotations(img_path, label_path, output_path=None):
    """Draw YOLO annotations on an image and save or display."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("OpenCV not available. Install: pip install opencv-python")
        return

    img = cv2.imread(str(img_path))
    if img is None:
        print(f"Could not read image: {img_path}")
        return

    h, w = img.shape[:2]

    if label_path.exists():
        with open(label_path) as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) != 5:
                    continue
                cid, cx, cy, bw, bh = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                x1 = int((cx - bw / 2) * w)
                y1 = int((cy - bh / 2) * h)
                x2 = int((cx + bw / 2) * w)
                y2 = int((cy + bh / 2) * h)
                color = COLORS.get(cid, (128, 128, 128))
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                label = RDD2022_CLASSES.get(cid, f"class_{cid}")
                cv2.putText(img, label, (x1, max(y1 - 5, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

    if output_path:
        cv2.imwrite(str(output_path), img)
        print(f"Saved: {output_path}")
    else:
        cv2.imshow("Annotation", img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()


def visualize_dataset(dataset_dir, split="train", count=5, output_dir=None, seed=42):
    dataset_dir = Path(dataset_dir)
    images_dir = dataset_dir / "images" / split
    labels_dir = dataset_dir / "labels" / split

    if not images_dir.exists():
        images_dir = dataset_dir / "images"
        labels_dir = dataset_dir / "labels"

    all_imgs = [f for f in images_dir.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    random.seed(seed)
    sample = random.sample(all_imgs, min(count, len(all_imgs)))

    out = Path(output_dir) if output_dir else None
    if out:
        out.mkdir(parents=True, exist_ok=True)

    for img_path in sample:
        lbl_path = labels_dir / img_path.relative_to(images_dir).with_suffix(".txt")
        out_path = (out / f"vis_{img_path.name}") if out else None
        draw_annotations(img_path, lbl_path, out_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--split", default="train")
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()
    visualize_dataset(args.dataset_dir, args.split, args.count, args.output_dir)
