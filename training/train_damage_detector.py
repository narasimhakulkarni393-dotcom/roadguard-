#!/usr/bin/env python3
"""Train the RoadGuard YOLOv8 damage detector.

Expects a dataset already prepared by training/prepare_kaggle_dataset.py. Training
never downloads data and never overwrites models/detection/best.pt unless --deploy
is passed; evaluation on the held-out test split is a separate step.

Usage:
    python -m training.train_damage_detector --epochs 30
    python -m training.train_damage_detector --epochs 1 --fraction 0.05 --name smoke
    python -m training.train_damage_detector --epochs 30 --deploy
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DATA = "datasets/processed/kaggle_road_damage/dataset.yaml"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the RoadGuard damage detector")
    parser.add_argument("--data", default=DEFAULT_DATA, help="Path to dataset.yaml")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=512)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--fraction", type=float, default=1.0, help="Fraction of training data per epoch")
    parser.add_argument("--name", default=None, help="Run name under models/runs")
    parser.add_argument("--project", default="models/runs")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--deploy", action="store_true", help="Copy best weights to models/detection/best.pt")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        import torch
        from ultralytics import YOLO
    except ImportError as exc:
        sys.exit(f"Missing dependency: {exc}. Install with: python -m pip install -r requirements.txt")

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        sys.exit(
            f"Dataset config not found: {data_path}\n"
            "Prepare it first: python -m training.prepare_kaggle_dataset"
        )

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    seed = args.seed
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    run_name = args.name or f"roadguard_kaggle_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    project = Path(args.project).resolve()

    print("=" * 62)
    print("  RoadGuard damage detector training")
    print(f"  data     : {data_path}")
    print(f"  run      : {project / run_name}")
    print(f"  epochs   : {args.epochs}  batch: {args.batch}  imgsz: {args.imgsz}")
    print(f"  device   : {device}  workers: {args.workers}  seed: {seed}")
    print(f"  fraction : {args.fraction}")
    print("=" * 62)

    base_weights = Path("yolov8n.pt")
    if not base_weights.exists():
        sys.exit(
            "yolov8n.pt not found in the repository root. Ultralytics would download it; "
            "place the checkpoint locally or run with network access."
        )

    model = YOLO(str(base_weights))
    if args.resume:
        last = project / run_name / "weights" / "last.pt"
        if not last.exists():
            sys.exit(f"Cannot resume: {last} not found")
        model = YOLO(str(last))

    model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        workers=args.workers,
        seed=seed,
        deterministic=True,
        patience=args.patience,
        fraction=args.fraction,
        amp=False,
        plots=True,
        save=True,
        val=True,
        project=str(project),
        name=run_name,
        exist_ok=True,
        verbose=True,
        resume=args.resume,
    )

    run_dir = project / run_name
    results_csv = run_dir / "results.csv"
    summary = {
        "run": run_name,
        "data": str(data_path),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": device,
        "seed": seed,
        "fraction": args.fraction,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "best_weights": str(run_dir / "weights" / "best.pt"),
        "results_csv": str(results_csv) if results_csv.exists() else None,
    }

    best = run_dir / "weights" / "best.pt"
    if not best.exists():
        sys.exit(f"Training finished without weights at {best}")

    summary["best_weights_bytes"] = best.stat().st_size
    (run_dir / "train_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f">>> Best weights: {best}")

    if args.deploy:
        target = Path("models/detection/best.pt")
        if target.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            backup = target.with_name(f"best.backup_{stamp}.pt")
            shutil.copy2(target, backup)
            print(f">>> Backed up previous checkpoint to {backup}")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(best, target)
        print(f">>> Deployed {best} -> {target}")
    else:
        print(">>> Weights were not deployed. Evaluate the held-out split first, then use --deploy "
              "or copy the file manually.")


if __name__ == "__main__":
    main()
