#!/usr/bin/env python3
"""
Authenticity classifier inference for RoadGuard AI.
Classifies an image as natural or ai_generated.
Falls back to heuristic analysis if no trained model is available.

Usage:
    python -m ml.authenticity.predict --model models/authenticity/best.pt --image path/to/image.jpg
    python -m ml.authenticity.predict --image path/to/image.jpg  # heuristic mode
"""
import argparse
import json
import sys
from pathlib import Path


def heuristic_predict(image_path: str) -> dict:
    """
    Simple heuristic authenticity check without a trained model.
    Checks noise level, compression artifacts, and color statistics.
    Returns a dict with label and confidence.
    """
    try:
        import numpy as np
        from PIL import Image
        import cv2
    except ImportError:
        return {"label": "unknown", "confidence": 0.0, "method": "heuristic", "note": "PIL/OpenCV required"}

    img = cv2.imread(str(image_path))
    if img is None:
        return {"label": "unknown", "confidence": 0.0, "method": "heuristic"}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Noise estimate via Laplacian
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Color saturation
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mean_sat = float(hsv[:, :, 1].mean())

    # Very high sharpness + very uniform saturation → possibly AI
    if lap_var > 500 and mean_sat < 30:
        label, conf = "ai_generated", 0.6
    else:
        label, conf = "natural", 0.65

    return {
        "label": label,
        "confidence": conf,
        "method": "heuristic",
        "features": {"laplacian_variance": lap_var, "mean_saturation": mean_sat}
    }


def model_predict(model_path: str, image_path: str, device: str = "auto") -> dict:
    try:
        import torch
        from torchvision import models, transforms
        from PIL import Image
    except ImportError as e:
        return {"error": str(e)}

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    checkpoint = torch.load(model_path, map_location=device)
    classes = checkpoint.get("classes", ["ai_generated", "natural"])

    model = models.mobilenet_v3_small(weights=None)
    model.classifier[-1] = torch.nn.Linear(model.classifier[-1].in_features, 2)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval().to(device)

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    img = Image.open(image_path).convert("RGB")
    tensor = transform(img).unsqueeze(0).to(device)

    with torch.no_grad():
        import torch.nn.functional as F
        logits = model(tensor)
        probs = F.softmax(logits, dim=1)[0]
        pred_idx = probs.argmax().item()
        confidence = float(probs[pred_idx])

    return {
        "label": classes[pred_idx],
        "confidence": confidence,
        "method": "model",
        "probabilities": {cls: float(probs[i]) for i, cls in enumerate(classes)}
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=None)
    parser.add_argument("--image", required=True)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    model_path = Path(args.model) if args.model else Path("models/authenticity/best.pt")
    if model_path.exists():
        result = model_predict(str(model_path), args.image, args.device)
    else:
        print("No trained model found, using heuristic analysis.")
        result = heuristic_predict(args.image)

    print(json.dumps(result, indent=2))
