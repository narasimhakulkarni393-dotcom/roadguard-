"""Dataset preparation and normalization pipeline for RoadGuard AI."""
from pathlib import Path
import json

def prepare():
    workspace = Path(__file__).resolve().parent.parent
    data_dir = workspace / "datasets" / "processed" / "kaggle_road_damage"
    manifest_path = workspace / "datasets" / "manifests" / "dataset_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    
    train_imgs = list((data_dir / "images" / "train").glob("*.jpg"))
    val_imgs = list((data_dir / "images" / "val").glob("*.jpg"))
    
    manifest = {
        "dataset_name": "kaggle_road_damage",
        "source": "lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes",
        "format": "YOLOv8 bounding boxes",
        "classes": ["Pothole", "Crack", "Manhole"],
        "counts": {
            "train": len(train_imgs),
            "val": len(val_imgs),
            "total": len(train_imgs) + len(val_imgs),
        },
        "license": "CC BY-SA 4.0",
    }
    
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Dataset manifest created at: {manifest_path}")

if __name__ == "__main__":
    prepare()
