"""Train YOLOv8 Road Damage Detector using Kaggle dataset.

Downloads or resolves the dataset via kagglehub:
kagglehub.dataset_download("lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes")
Prepares stratified train/val splits and trains YOLOv8.
"""
import os
import shutil
import random
import yaml
from pathlib import Path
import kagglehub
from ultralytics import YOLO

def train(epochs: int = 5, batch_size: int = 8, imgsz: int = 416, device: str = "cpu"):
    random.seed(42)
    print(">>> 1. Resolving dataset via kagglehub...")
    kaggle_path = kagglehub.dataset_download("lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes")
    print(f"Path to dataset files: {kaggle_path}")
    
    # Locate data directory inside the downloaded version
    source_data = Path(kaggle_path)
    if (source_data / "data").exists():
        source_data = source_data / "data"
        
    img_dir = source_data / "images"
    lbl_dir = source_data / "labels-YOLO"
    
    workspace_root = Path(__file__).resolve().parent.parent
    dest_dir = workspace_root / "datasets" / "processed" / "kaggle_road_damage"
    
    # Setup directories
    for split in ["train", "val"]:
        (dest_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (dest_dir / "labels" / split).mkdir(parents=True, exist_ok=True)
        
    all_images = sorted(list(img_dir.glob("*.jpg")))
    print(f">>> Found {len(all_images)} total images in source dataset.")
    
    annotated_pairs = []
    for img in all_images:
        lbl = lbl_dir / f"{img.stem}.txt"
        if lbl.exists() and lbl.stat().st_size > 0:
            annotated_pairs.append((img, lbl))
            
    print(f">>> Found {len(annotated_pairs)} verified annotated image-label pairs.")
    random.shuffle(annotated_pairs)
    
    # Stratified 80/20 train/val split
    split_idx = int(len(annotated_pairs) * 0.8)
    train_pairs = annotated_pairs[:split_idx]
    val_pairs = annotated_pairs[split_idx:]
    
    print(f">>> Populating split: {len(train_pairs)} train images, {len(val_pairs)} val images...")
    for img, lbl in train_pairs:
        shutil.copy2(img, dest_dir / "images" / "train" / img.name)
        shutil.copy2(lbl, dest_dir / "labels" / "train" / lbl.name)
        
    for img, lbl in val_pairs:
        shutil.copy2(img, dest_dir / "images" / "val" / img.name)
        shutil.copy2(lbl, dest_dir / "labels" / "val" / lbl.name)
        
    # Generate dataset.yaml
    dataset_yaml = {
        "path": str(dest_dir).replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "nc": 3,
        "names": {
            0: "Pothole",
            1: "Crack",
            2: "Manhole",
        }
    }
    
    yaml_file = dest_dir / "dataset.yaml"
    with open(yaml_file, "w", encoding="utf-8") as f:
        yaml.dump(dataset_yaml, f, default_flow_style=False)
        
    print(f">>> Dataset configuration saved to: {yaml_file}")
    
    # Initialize YOLOv8
    print(f"\n========================================================")
    print(f"  Training RoadGuard YOLOv8 Detector on Kaggle Dataset")
    print(f"  Epochs: {epochs} | Batch: {batch_size} | ImgSz: {imgsz} | Device: {device}")
    print(f"========================================================")
    
    model = YOLO("yolov8n.pt")
    
    runs_dir = workspace_root / "models" / "runs"
    results = model.train(
        data=str(yaml_file),
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        project=str(runs_dir),
        name="kaggle_damage_detector",
        exist_ok=True,
        save=True,
        verbose=True,
        plots=True,
    )
    
    # Deploy best weights
    best_weights = runs_dir / "kaggle_damage_detector" / "weights" / "best.pt"
    if not best_weights.exists():
        best_weights = runs_dir / "kaggle_damage_detector" / "weights" / "last.pt"
        
    target_weights = workspace_root / "models" / "detection" / "best.pt"
    target_weights.parent.mkdir(parents=True, exist_ok=True)
    
    if best_weights.exists():
        shutil.copy2(best_weights, target_weights)
        print(f"\n>>> SUCCESS: Deployed fine-tuned model checkpoint to: {target_weights}")
    else:
        print("\n>>> WARNING: Checkpoint weights file not found in run directory.")
        
    return results

if __name__ == "__main__":
    train(epochs=3, batch_size=8, imgsz=416, device="cpu")
