#!/usr/bin/env python3
"""
YOLO detection model inference for RoadGuard AI.

Usage:
    python -m ml.detection.predict --model models/detection/best.pt --image path/to/image.jpg
"""
import argparse
import json
import sys
from pathlib import Path


def predict(model_path, image_path, conf=0.25, iou=0.45, device="auto", save=False, output_dir="storage/annotated"):
    try:
        from ultralytics import YOLO
        import torch
    except ImportError as e:
        print(f"Missing dependency: {e}")
        sys.exit(1)

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model_path = Path(model_path)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        sys.exit(1)

    model = YOLO(str(model_path))
    results = model.predict(
        source=str(image_path),
        conf=conf,
        iou=iou,
        device=device,
        save=save,
        project=output_dir if save else None,
        verbose=False
    )

    CLASS_NAMES = {
        0: "D00_Longitudinal_Crack",
        1: "D10_Transverse_Crack",
        2: "D20_Alligator_Crack",
        3: "D40_Pothole"
    }

    detections = []
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "class_id": int(box.cls[0]),
                "class_name": CLASS_NAMES.get(int(box.cls[0]), "unknown"),
                "confidence": float(box.conf[0]),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
            })

    output = {"image": str(image_path), "detections": detections}
    print(json.dumps(output, indent=2))
    return detections


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--output-dir", default="storage/annotated")
    args = parser.parse_args()
    predict(args.model, args.image, args.conf, args.iou, args.device, args.save, args.output_dir)
