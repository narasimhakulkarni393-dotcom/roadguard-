"""Train binary Road vs Non-Road scene classifier using MobileNetV3 / EfficientNet-B0."""
import os
import argparse
from pathlib import Path
import torch
import torch.nn as nn
from torchvision import models, transforms, datasets
from torch.utils.data import DataLoader

def train_road_classifier(epochs: int = 5, batch_size: int = 16, lr: float = 0.001):
    workspace = Path(__file__).resolve().parent.parent
    data_dir = workspace / "datasets" / "road_classifier"
    output_dir = workspace / "models" / "road_classifier"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training Road Scene Classifier on device: {device}")
    
    # Model architecture: MobileNetV3 Small for fast, lightweight edge inference
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    in_features = model.classifier[3].in_features
    # Binary classification: Road (1) vs Non-Road (0)
    model.classifier[3] = nn.Linear(in_features, 2)
    model = model.to(device)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    
    save_path = output_dir / "best.pt"
    torch.save(model.state_dict(), str(save_path))
    print(f"Road classifier model weights saved to: {save_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=5)
    args = parser.parse_args()
    train_road_classifier(epochs=args.epochs)
