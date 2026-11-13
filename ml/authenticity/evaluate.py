#!/usr/bin/env python3
"""
Authenticity classifier evaluation for RoadGuard AI.

Usage: python -m ml.authenticity.evaluate --model models/authenticity/best.pt --dataset datasets/processed/authenticity
"""
import argparse
import json
import sys
from pathlib import Path


def evaluate(model_path, dataset_dir, split="test", batch=32, device="auto"):
    try:
        import torch
        from torchvision import models, transforms
        from torch.utils.data import DataLoader
        from torchvision.datasets import ImageFolder
        from sklearn.metrics import classification_report, confusion_matrix
    except ImportError as e:
        print(f"Missing dependency: {e}")
        sys.exit(1)

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model_path = Path(model_path)
    checkpoint = torch.load(str(model_path), map_location=device)

    model = models.mobilenet_v3_small(weights=None)
    model.classifier[-1] = torch.nn.Linear(model.classifier[-1].in_features, 2)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    ds = ImageFolder(Path(dataset_dir) / split, transform=transform)
    loader = DataLoader(ds, batch_size=batch, num_workers=0)

    all_preds = []
    all_labels = []
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)
            outputs = model(imgs)
            _, preds = outputs.max(1)
            all_preds.extend(preds.cpu().tolist())
            all_labels.extend(labels.cpu().tolist())

    report = classification_report(all_labels, all_preds, target_names=ds.classes, output_dict=True)
    cm = confusion_matrix(all_labels, all_preds).tolist()

    result = {"classification_report": report, "confusion_matrix": cm, "classes": ds.classes}
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--split", default="test")
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()
    evaluate(args.model, args.dataset, args.split, args.batch, args.device)
