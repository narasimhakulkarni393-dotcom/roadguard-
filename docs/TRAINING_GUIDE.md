# RoadGuard AI — Model Training & Pipeline Guide

## 1. Quick Start Detection Training

To train the YOLOv8 road damage detection model on RDD2022:

```bash
# 1. Download/place the raw RDD2022 dataset under datasets/raw/rdd2022
# 2. Convert Pascal VOC XML annotations to YOLO format:
python -m ml.datasets.convert_voc_to_yolo --input datasets/raw/rdd2022 --output datasets/processed/rdd2022

# 3. Validate dataset integrity:
python -m ml.datasets.validate --dataset-dir datasets/processed/rdd2022

# 4. Train YOLOv8n:
python -m ml.detection.train --dataset datasets/processed/rdd2022 --epochs 50 --batch 8 --device cpu
```

When training completes, the best checkpoint is automatically saved to:
`models/detection/best.pt`

The FastAPI backend automatically detects and activates this model checkpoint on subsequent requests.

## 2. Authenticity Classifier Training

```bash
python -m ml.authenticity.train --dataset datasets/processed/authenticity --epochs 30
```
Checkpoints are saved to `models/authenticity/best.pt`.
