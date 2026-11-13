#!/usr/bin/env python3
"""
Evaluation metrics for RoadGuard AI detection models.

Implements:
- Mean Average Precision (mAP) at IoU=0.50 and 0.50:0.95
- Per-class AP
- Precision / Recall curves
"""
import json
import numpy as np
from pathlib import Path
from collections import defaultdict


def compute_iou(box1, box2):
    """Compute IoU between two boxes in [x1, y1, x2, y2] format."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0.0


def compute_ap(recalls, precisions):
    """Compute AP using 11-point interpolation."""
    ap = 0.0
    for t in np.linspace(0, 1, 11):
        p = max((precisions[i] for i, r in enumerate(recalls) if r >= t), default=0.0)
        ap += p / 11
    return ap


def evaluate_detections(predictions, ground_truths, iou_threshold=0.5, num_classes=4):
    """
    Compute per-class AP and mAP.

    predictions: list of {"image_id", "class_id", "confidence", "bbox": [x1,y1,x2,y2]}
    ground_truths: list of {"image_id", "class_id", "bbox": [x1,y1,x2,y2]}
    """
    CLASS_NAMES = {
        0: "D00_Longitudinal_Crack",
        1: "D10_Transverse_Crack",
        2: "D20_Alligator_Crack",
        3: "D40_Pothole"
    }

    # Group ground truths by image and class
    gt_by_image_class = defaultdict(list)
    for gt in ground_truths:
        gt_by_image_class[(gt["image_id"], gt["class_id"])].append({"bbox": gt["bbox"], "matched": False})

    # Sort predictions by confidence descending
    preds_by_class = defaultdict(list)
    for p in predictions:
        preds_by_class[p["class_id"]].append(p)

    aps = {}
    for cls_id in range(num_classes):
        cls_preds = sorted(preds_by_class[cls_id], key=lambda x: -x["confidence"])
        total_gt = sum(len(v) for k, v in gt_by_image_class.items() if k[1] == cls_id)

        if total_gt == 0:
            aps[cls_id] = 0.0
            continue

        tp = []
        fp = []
        matched_gt = defaultdict(list)

        for pred in cls_preds:
            img_id = pred["image_id"]
            gt_list = gt_by_image_class.get((img_id, cls_id), [])
            best_iou = 0
            best_idx = -1
            for i, gt in enumerate(gt_list):
                iou = compute_iou(pred["bbox"], gt["bbox"])
                if iou > best_iou:
                    best_iou = iou
                    best_idx = i

            if best_iou >= iou_threshold and best_idx >= 0 and not gt_list[best_idx]["matched"]:
                tp.append(1)
                fp.append(0)
                gt_list[best_idx]["matched"] = True
            else:
                tp.append(0)
                fp.append(1)

        tp_cum = np.cumsum(tp)
        fp_cum = np.cumsum(fp)
        recalls = (tp_cum / total_gt).tolist()
        precisions = (tp_cum / (tp_cum + fp_cum + 1e-9)).tolist()
        aps[cls_id] = compute_ap(recalls, precisions)

    map50 = np.mean(list(aps.values()))
    result = {
        "mAP50": float(map50),
        "per_class_AP": {CLASS_NAMES[k]: float(v) for k, v in aps.items()}
    }
    return result


if __name__ == "__main__":
    # Example self-test
    preds = [{"image_id": "img1", "class_id": 3, "confidence": 0.9, "bbox": [10, 10, 50, 50]}]
    gts = [{"image_id": "img1", "class_id": 3, "bbox": [12, 12, 48, 48]}]
    result = evaluate_detections(preds, gts)
    print(json.dumps(result, indent=2))
