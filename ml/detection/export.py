#!/usr/bin/env python3
"""
Export YOLO detection model to ONNX or other formats for deployment.

Usage:
    python -m ml.detection.export --model models/detection/best.pt --format onnx
"""
import argparse
import sys
from pathlib import Path


def export_model(model_path, format="onnx", imgsz=640, device="cpu", simplify=True):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics not installed: pip install ultralytics")
        sys.exit(1)

    model_path = Path(model_path)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        sys.exit(1)

    model = YOLO(str(model_path))
    exported = model.export(
        format=format,
        imgsz=imgsz,
        device=device,
        simplify=simplify
    )
    print(f"Model exported to: {exported}")
    return exported


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--format", default="onnx", choices=["onnx", "torchscript", "tflite", "coreml"])
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--no-simplify", action="store_true")
    args = parser.parse_args()
    export_model(args.model, args.format, args.imgsz, args.device, not args.no_simplify)
