"""Evaluate YOLOv8 Road Damage Detection model performance."""
from pathlib import Path
from ultralytics import YOLO

def evaluate():
    workspace_root = Path(__file__).resolve().parent.parent
    weights_path = workspace_root / "models" / "detection" / "best.pt"
    data_yaml = workspace_root / "datasets" / "processed" / "kaggle_road_damage" / "dataset.yaml"
    
    if not weights_path.exists():
        print(f"Error: Model weights not found at {weights_path}")
        return
        
    print(f"Loading checkpoint from: {weights_path}")
    model = YOLO(str(weights_path))
    
    print(f"Running validation on: {data_yaml}")
    metrics = model.val(data=str(data_yaml), split="val", device="cpu", verbose=True)
    
    print("\n================ EVALUATION METRICS ================")
    print(f"mAP50:     {metrics.box.map50:.4f}")
    print(f"mAP50-95:  {metrics.box.map:.4f}")
    print(f"Precision: {metrics.box.mp:.4f}")
    print(f"Recall:    {metrics.box.mr:.4f}")
    print("====================================================")
    
    return metrics

if __name__ == "__main__":
    evaluate()
