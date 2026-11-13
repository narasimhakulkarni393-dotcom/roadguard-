"""Dataset preparation and training script for RoadGuard AI using the downloaded Kaggle road damage dataset."""
import os
import shutil
import random
from pathlib import Path
import yaml
from ultralytics import YOLO

def prepare_and_train():
    random.seed(42)
    source_dir = Path(r"C:\Users\NARASIMHA\.cache\kagglehub\datasets\lorenzoarcioni\road-damage-dataset-potholes-cracks-and-manholes\versions\4\data")
    dest_dir = Path(r"C:\Users\NARASIMHA\OneDrive\Desktop\MY FOLDER\rdx\datasets\processed\kaggle_road_damage").resolve()
    
    # Create target directories
    for split in ["train", "val"]:
        (dest_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (dest_dir / "labels" / split).mkdir(parents=True, exist_ok=True)
        
    all_images = sorted(list((source_dir / "images").glob("*.jpg")))
    print(f"Total available images: {len(all_images)}")
    
    # Filter images that actually have non-empty labels
    annotated_pairs = []
    for img in all_images:
        lbl = source_dir / "labels-YOLO" / f"{img.stem}.txt"
        if lbl.exists() and lbl.stat().st_size > 0:
            annotated_pairs.append((img, lbl))
            
    print(f"Total images with non-empty annotations: {len(annotated_pairs)}")
    random.shuffle(annotated_pairs)
    
    # Select a solid subset for CPU fine-tuning (160 train, 40 val) so training finishes in 3-5 minutes
    subset = annotated_pairs[:200]
    train_pairs = subset[:160]
    val_pairs = subset[160:]
    
    print(f"Copying {len(train_pairs)} training images and {len(val_pairs)} validation images...")
    for img, lbl in train_pairs:
        shutil.copy2(img, dest_dir / "images" / "train" / img.name)
        shutil.copy2(lbl, dest_dir / "labels" / "train" / lbl.name)
        
    for img, lbl in val_pairs:
        shutil.copy2(img, dest_dir / "images" / "val" / img.name)
        shutil.copy2(lbl, dest_dir / "labels" / "val" / lbl.name)
        
    # Create dataset.yaml
    yaml_data = {
        "path": str(dest_dir).replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "nc": 3,
        "names": {
            0: "Pothole",
            1: "Crack",
            2: "Manhole"
        }
    }
    
    yaml_path = dest_dir / "dataset.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(yaml_data, f, default_flow_style=False)
        
    print(f"Dataset YAML generated at: {yaml_path}")
    
    # Train YOLOv8n
    print("\n================ STARTING YOLOV8n FINE-TUNING ================")
    print("Pretrained checkpoint: yolov8n.pt")
    print("Device: CPU")
    print("Epochs: 3")
    print("Batch size: 8")
    print("Image size: 416")
    
    model = YOLO("yolov8n.pt")
    
    results = model.train(
        data=str(yaml_path),
        epochs=3,
        batch=8,
        imgsz=416,
        device="cpu",
        project=r"C:\Users\NARASIMHA\OneDrive\Desktop\MY FOLDER\rdx\models\runs",
        name="roadguard_kaggle_train",
        save=True,
        verbose=True
    )
    
    # Copy best weights to models/detection/best.pt
    best_weights = Path(r"C:\Users\NARASIMHA\OneDrive\Desktop\MY FOLDER\rdx\models\runs\roadguard_kaggle_train\weights\best.pt")
    target_weights = Path(r"C:\Users\NARASIMHA\OneDrive\Desktop\MY FOLDER\rdx\models\detection\best.pt")
    target_weights.parent.mkdir(parents=True, exist_ok=True)
    
    if best_weights.exists():
        shutil.copy2(best_weights, target_weights)
        print(f"\nSUCCESS: Best model checkpoint saved directly to: {target_weights}")
    else:
        # Fallback to last.pt if best.pt not generated
        last_weights = Path(r"C:\Users\NARASIMHA\OneDrive\Desktop\MY FOLDER\rdx\models\runs\roadguard_kaggle_train\weights\last.pt")
        if last_weights.exists():
            shutil.copy2(last_weights, target_weights)
            print(f"\nSUCCESS: Last model checkpoint saved directly to: {target_weights}")
            
    print("\nTraining complete! Testing model on sample validation image...")
    val_sample = val_pairs[0][0]
    preds = model.predict(source=str(val_sample), conf=0.25)
    print(f"Sample prediction completed on: {val_sample.name}")
    for p in preds:
        print(f"Detected {len(p.boxes)} road defect(s):")
        for box in p.boxes:
            cls_id = int(box.cls.item())
            conf = float(box.conf.item())
            print(f"  - Class: {yaml_data['names'][cls_id]} ({cls_id}) | Confidence: {conf:.2%}")

if __name__ == "__main__":
    prepare_and_train()
