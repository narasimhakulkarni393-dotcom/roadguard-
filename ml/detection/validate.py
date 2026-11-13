#!/usr/bin/env python3
"""
YOLO detection model validation for RoadGuard AI.

Usage:
    python -m ml.detection.validate --model models/detection/best.pt --dataset datasets/processed/rdd2022
"""
import argparse
import json
import sys
from pathlib import Path


def validate(model_path, dataset_dir, imgsz=640, batch=8, conf=0.25, iou=0.45, device="auto"):
    try:
        from ultralytics import YOLO
        import torch
    except ImportError as e:
        print(f"Missing dependency: {e}")
        sys.exit(1)

    if device == "auto":
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model_path = Path(model_path)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        print("Train the model first: python -m ml.detection.train --dataset ...")
        sys.exit(1)

    dataset_path = Path(dataset_dir)
    yaml_path = dataset_path / "dataset.yaml"
    if not yaml_path.exists():
        # Try to find in models dir
        yaml_path = model_path.parent / "dataset.yaml"

    if not yaml_path.exists():
        print(f"dataset.yaml not found. Expected at {yaml_path}")
        sys.exit(1)

    model = YOLO(str(model_path))
    results = model.val(
        data=str(yaml_path),
        imgsz=imgsz,
        batch=batch,
        conf=conf,
        iou=iou,
        device=device
    )

    metrics = {
        "mAP50": float(results.box.map50),
        "mAP50_95": float(results.box.map),
        "precision": float(results.box.mp),
        "recall": float(results.box.mr),
    }
    print(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()
    validate(args.model, args.dataset, args.imgsz, args.batch, args.conf, args.iou, args.device)
