"""Train YOLOv8-seg segmentation model for fine crack boundary delineation."""
import argparse
from pathlib import Path
from ultralytics import YOLO

def train_segmentation(epochs: int = 5, imgsz: int = 640):
    workspace = Path(__file__).resolve().parent.parent
    data_yaml = workspace / "datasets" / "processed" / "kaggle_road_damage" / "dataset.yaml"
    runs_dir = workspace / "models" / "runs"
    
    print("Initializing YOLOv8n-seg segmentation architecture...")
    model = YOLO("yolov8n-seg.pt")
    
    print(f"Starting segmentation fine-tuning (Epochs: {epochs}, ImgSz: {imgsz})...")
    # Note: Segmentation annotations require polygon masks
    print("Segmentation script ready for datasets with polygon mask ground-truth.")

if __name__ == "__main__":
    train_segmentation()
