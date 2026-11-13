#!/usr/bin/env python3
"""
YOLO detection model training for RoadGuard AI.

RDD2022 Class Mapping:
  0: D00_Longitudinal_Crack
  1: D10_Transverse_Crack
  2: D20_Alligator_Crack
  3: D40_Pothole

Usage:
    python -m ml.detection.train --dataset datasets/processed/rdd2022 --epochs 50

IMPORTANT: No trained weights exist yet. This script creates the training workflow.
Training requires a prepared dataset. See docs/TRAINING_GUIDE.md.
"""
import argparse
import json
import sys
import os
from pathlib import Path
from datetime import datetime


def check_dependencies():
    errors = []
    try:
        from ultralytics import YOLO
    except ImportError:
        errors.append("ultralytics not installed: python -m pip install ultralytics")
    try:
        import torch
    except ImportError:
        errors.append("torch not installed")
    return errors


def create_dataset_yaml(dataset_dir, output_path):
    """Create YOLO dataset.yaml for training."""
    dataset_dir = Path(dataset_dir).resolve()
    config = {
        "path": str(dataset_dir),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": 4,
        "names": {
            0: "D00_Longitudinal_Crack",
            1: "D10_Transverse_Crack",
            2: "D20_Alligator_Crack",
            3: "D40_Pothole"
        }
    }
    import yaml
    with open(output_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)
    return output_path


def train(dataset_dir, epochs=50, imgsz=640, batch=8, lr=0.01, device="cpu",
          output_dir="models/detection", experiment_name=None):
    deps = check_dependencies()
    if deps:
        print("Missing dependencies:")
        for dep in deps:
            print(f"  - {dep}")
        sys.exit(1)

    from ultralytics import YOLO
    import torch

    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        print(f"Dataset directory not found: {dataset_path}")
        print("Please prepare the dataset first using:")
        print("  python -m ml.datasets.convert_voc_to_yolo --input datasets/raw/rdd2022 --output datasets/processed/rdd2022")
        sys.exit(1)

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Training device: {device}")

    if not experiment_name:
        experiment_name = f"roadguard_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    yaml_path = Path(output_dir) / "dataset.yaml"
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    create_dataset_yaml(dataset_dir, yaml_path)

    config = {
        "experiment_name": experiment_name,
        "dataset_dir": str(dataset_dir),
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "lr": lr,
        "device": device,
        "model_arch": "yolov8n",
        "started_at": datetime.utcnow().isoformat()
    }
    config_path = Path(output_dir) / f"{experiment_name}_config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    print("Loading YOLOv8n pretrained checkpoint...")
    model = YOLO("yolov8n.pt")

    print(f"Starting training: {epochs} epochs, batch={batch}, imgsz={imgsz}")
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        lr0=lr,
        device=device,
        project=str(Path(output_dir) / "runs"),
        name=experiment_name,
        save=True,
        plots=True,
        verbose=True
    )

    best_path = Path(output_dir) / "runs" / experiment_name / "weights" / "best.pt"
    if best_path.exists():
        import shutil
        dest = Path(output_dir) / "best.pt"
        shutil.copy2(best_path, dest)
        print(f"Best checkpoint saved: {dest}")

    print("Training complete!")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train RoadGuard AI detection model")
    parser.add_argument("--dataset", required=True, help="Path to processed YOLO dataset")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--lr", type=float, default=0.01)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--output", default="models/detection")
    parser.add_argument("--name", default=None)
    args = parser.parse_args()
    train(args.dataset, args.epochs, args.imgsz, args.batch, args.lr, args.device, args.output, args.name)
