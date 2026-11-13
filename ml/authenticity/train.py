#!/usr/bin/env python3
"""
Authenticity classifier training for RoadGuard AI.
Binary classifier: natural vs ai_generated
Uses MobileNetV3-Small from torchvision (lightweight, CPU-friendly).

Usage: python -m ml.authenticity.train --dataset datasets/processed/authenticity --epochs 30

IMPORTANT: This requires an authenticity dataset. Without it, the system uses
heuristic-based authenticity detection. See docs/TRAINING_GUIDE.md for dataset preparation.
"""
import argparse
import json
import sys
from pathlib import Path
from datetime import datetime


def train(dataset_dir, epochs=30, imgsz=224, batch=32, lr=0.001, device="auto", output_dir="models/authenticity"):
    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        print(f"Authenticity dataset not found: {dataset_path}")
        print("The authenticity classifier will use heuristic-based detection until a model is trained.")
        print("See docs/TRAINING_GUIDE.md for dataset preparation instructions.")
        return

    try:
        import torch
        import torchvision
        from torchvision import models, transforms
        from torch.utils.data import DataLoader
        from torchvision.datasets import ImageFolder
    except ImportError as e:
        print(f"Missing dependency: {e}")
        sys.exit(1)

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Training device: {device}")

    train_transform = transforms.Compose([
        transforms.Resize((imgsz, imgsz)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(0.1, 0.1, 0.1),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    val_transform = transforms.Compose([
        transforms.Resize((imgsz, imgsz)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    train_ds = ImageFolder(dataset_path / "train", transform=train_transform)
    val_ds = ImageFolder(dataset_path / "val", transform=val_transform)
    print(f"Classes: {train_ds.classes}")
    print(f"Train samples: {len(train_ds)}, Val samples: {len(val_ds)}")

    model = models.mobilenet_v3_small(weights="IMAGENET1K_V1")
    model.classifier[-1] = torch.nn.Linear(model.classifier[-1].in_features, 2)
    model = model.to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = torch.nn.CrossEntropyLoss()

    best_acc = 0.0
    history = []

    for epoch in range(epochs):
        model.train()
        correct = total = 0
        running_loss = 0.0
        for imgs, labels in DataLoader(train_ds, batch_size=batch, shuffle=True, num_workers=0):
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
            running_loss += loss.item()

        train_acc = correct / total
        scheduler.step()

        model.eval()
        val_correct = val_total = 0
        with torch.no_grad():
            for imgs, labels in DataLoader(val_ds, batch_size=batch, num_workers=0):
                imgs, labels = imgs.to(device), labels.to(device)
                outputs = model(imgs)
                _, predicted = outputs.max(1)
                val_total += labels.size(0)
                val_correct += predicted.eq(labels).sum().item()
        val_acc = val_correct / val_total

        print(f"Epoch {epoch+1}/{epochs}: train_acc={train_acc:.4f} val_acc={val_acc:.4f}")
        history.append({"epoch": epoch + 1, "train_acc": train_acc, "val_acc": val_acc})

        if val_acc > best_acc:
            best_acc = val_acc
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_acc": val_acc,
                "classes": train_ds.classes
            }, Path(output_dir) / "best.pt")

    print(f"Best validation accuracy: {best_acc:.4f}")
    with open(Path(output_dir) / "training_history.json", "w") as f:
        json.dump({"best_val_acc": best_acc, "history": history}, f, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--output", default="models/authenticity")
    args = parser.parse_args()
    train(args.dataset, args.epochs, args.imgsz, args.batch, args.lr, args.device, args.output)
