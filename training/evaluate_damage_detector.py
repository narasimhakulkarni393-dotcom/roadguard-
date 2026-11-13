#!/usr/bin/env python3
"""Evaluate a trained RoadGuard checkpoint on a held-out split.

Writes a JSON metrics file plus Ultralytics plots (PR curve, confusion matrix).
No metrics are produced unless validation actually runs.

Usage:
    python -m training.evaluate_damage_detector --model models/runs/roadguard_kaggle_v2/weights/best.pt
    python -m training.evaluate_damage_detector --model models/detection/best.pt --split test --output models/runs/baseline_test_metrics.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DATA = "datasets/processed/kaggle_road_damage/dataset.yaml"


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [float(v) for v in value]
    try:
        return [float(v) for v in value.tolist()]
    except AttributeError:
        return [float(value)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate the RoadGuard damage detector")
    parser.add_argument("--model", required=True, help="Path to a YOLO checkpoint")
    parser.add_argument("--data", default=DEFAULT_DATA, help="Path to dataset.yaml")
    parser.add_argument("--split", default="test", choices=["val", "test"])
    parser.add_argument("--imgsz", type=int, default=512)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--conf", type=float, default=0.001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--output", default=None, help="Metrics JSON path")
    parser.add_argument("--project", default="models/runs")
    parser.add_argument("--name", default=None, help="Validation run name for plots")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        import torch
        from ultralytics import YOLO
    except ImportError as exc:
        sys.exit(f"Missing dependency: {exc}")

    model_path = Path(args.model)
    if not model_path.exists():
        sys.exit(f"Checkpoint not found: {model_path}")

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        sys.exit(f"Dataset config not found: {data_path}. Run training/prepare_kaggle_dataset.py first.")

    import yaml

    with open(data_path, encoding="utf-8") as fh:
        data_cfg = yaml.safe_load(fh)
    split_rel = data_cfg.get(args.split)
    if not split_rel:
        sys.exit(f"Split '{args.split}' is not defined in {data_path}")
    split_dir = Path(data_cfg["path"]) / split_rel
    image_count = len(list(split_dir.glob("*.jpg"))) + len(list(split_dir.glob("*.png")))
    if image_count == 0:
        sys.exit(f"Split '{args.split}' has no images under {split_dir}")

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    run_name = args.name or f"eval_{model_path.stem}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    model = YOLO(str(model_path))
    results = model.val(
        data=str(data_path),
        split=args.split,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        conf=args.conf,
        iou=args.iou,
        plots=True,
        project=str(Path(args.project).resolve()),
        name=run_name,
        exist_ok=True,
        verbose=True,
    )

    names = results.names if isinstance(results.names, dict) else dict(enumerate(results.names))
    box = results.box
    ap50 = _as_list(getattr(box, "ap50", None))
    ap = _as_list(getattr(box, "ap", None))
    precision = _as_list(getattr(box, "p", None))
    recall = _as_list(getattr(box, "r", None))

    per_class = {}
    for cls_id, cls_name in sorted(names.items()):
        per_class[cls_name] = {
            "ap50": ap50[cls_id] if cls_id < len(ap50) else None,
            "ap50_95": ap[cls_id] if cls_id < len(ap) else None,
            "precision": precision[cls_id] if cls_id < len(precision) else None,
            "recall": recall[cls_id] if cls_id < len(recall) else None,
        }

    metrics = {
        "model": str(model_path),
        "model_sha256_prefix": hashlib.sha256(model_path.read_bytes()).hexdigest()[:12],
        "data": str(data_path),
        "split": args.split,
        "split_images": image_count,
        "imgsz": args.imgsz,
        "conf": args.conf,
        "iou": args.iou,
        "device": device,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "overall": {
            "mAP50": float(box.map50),
            "mAP50_95": float(box.map),
            "precision": float(box.mp),
            "recall": float(box.mr),
        },
        "per_class": per_class,
        "speed_ms_per_image": {k: float(v) for k, v in getattr(results, "speed", {}).items()},
        "plots_dir": str(Path(args.project).resolve() / run_name),
    }

    output = Path(args.output) if args.output else (Path(args.project) / run_name / "metrics.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print("=" * 62)
    print(f"  Held-out '{args.split}' evaluation — {image_count} images")
    print(f"  model: {model_path}")
    print(f"  mAP50    : {metrics['overall']['mAP50']:.4f}")
    print(f"  mAP50-95 : {metrics['overall']['mAP50_95']:.4f}")
    print(f"  precision: {metrics['overall']['precision']:.4f}")
    print(f"  recall   : {metrics['overall']['recall']:.4f}")
    for cls_name, stats in per_class.items():
        print(f"  {cls_name:<12} AP50={stats['ap50']} AP50-95={stats['ap50_95']}")
    print(f">>> Metrics written to {output}")
    print("=" * 62)


if __name__ == "__main__":
    main()
