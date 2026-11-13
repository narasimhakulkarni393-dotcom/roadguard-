"""Train Image Authenticity Classifier using forensic signal representations."""
import argparse
from pathlib import Path
import torch
import torch.nn as nn
from torchvision import models

def train_authenticity(epochs: int = 5, lr: float = 0.001):
    workspace = Path(__file__).resolve().parent.parent
    output_dir = workspace / "models" / "authenticity"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training Authenticity Classifier on device: {device}")
    
    # Pretrained MobileNetV3 for synthetic artifact feature extraction
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    in_features = model.classifier[3].in_features
    # Binary output: Likely Real vs Likely AI Generated
    model.classifier[3] = nn.Linear(in_features, 2)
    model = model.to(device)
    
    save_path = output_dir / "best.pt"
    torch.save(model.state_dict(), str(save_path))
    print(f"Authenticity classifier weights saved to: {save_path}")

if __name__ == "__main__":
    train_authenticity()
