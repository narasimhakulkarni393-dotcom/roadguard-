# RoadGuard AI — Model Training & Pipeline Guide

## 1. Detection training on the Kaggle road-damage dataset

The detector is fine-tuned from the bundled `yolov8n.pt` checkpoint on the public
Kaggle dataset
[`lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes`](https://www.kaggle.com/datasets/lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes).
It is 2,009 JPEG images (640×360) with YOLO-format boxes for **pothole**, **crack** and
**manhole**. No Kaggle credentials are required; `kagglehub` performs a public download.

### Step 1 — prepare the dataset

```bash
python -m training.prepare_kaggle_dataset
```

This script:

- resolves the dataset through `kagglehub` (cached under `~/.cache/kagglehub`),
- validates every label file (class id in `{0,1,2}`, normalized coordinates, non-zero box),
- builds a **seeded (42) stratified 80/10/10 train/val/test split** by dominant class,
- copies pairs to `datasets/processed/kaggle_road_damage/`,
- writes `dataset.yaml` and `manifest.json` (source version, citation, counts, split sizes,
  annotation fingerprint, dropped malformed lines).

The prepared corpus is git-ignored on purpose. Re-running is deterministic for the same
dataset version and seed; use `--force` to rebuild.

### Step 2 — train

```bash
python -m training.train_damage_detector --epochs 25 --imgsz 416 --batch 8 --workers 4
```

- Seeds Python and torch, enables deterministic training.
- Uses CPU when no CUDA device is present. On a Ryzen 5 7235HS, 480 px ran at roughly
  10 min/epoch; 416 px is roughly 6 min/epoch. Expect a few hours for 25 epochs.
- Writes checkpoints and plots to `models/runs/<run>/`.
- **Does not** overwrite `models/detection/best.pt` unless `--deploy` is passed.

For a one-epoch pipeline check:

```bash
python -m training.train_damage_detector --epochs 1 --fraction 0.08 --name smoke --imgsz 416
```

### Step 3 — evaluate on the held-out test split

```bash
python -m training.evaluate_damage_detector \
  --model models/runs/<run>/weights/best.pt \
  --split test \
  --imgsz 416
```

The test split is never used for training or checkpoint selection. The script writes
`metrics.json` (overall mAP50, mAP50-95, precision, recall, per-class AP) plus PR-curve
and confusion-matrix plots. This repository has never quoted a metric that was not
produced by this command.

### Step 4 — deploy the checkpoint

```bash
python -m training.train_damage_detector ... --deploy   # backs up best.previous.pt, then copies
```

or copy manually:

```bash
cp models/runs/<run>/weights/best.pt models/detection/best.pt
```

Restart the backend afterwards: the detector is cached in-process, so a running server
keeps the previous weights.

### Class mapping

The dataset publishes three classes. The backend exposes a six-class taxonomy:

| Raw label | Canonical class | How it is produced |
|---|---|---|
| pothole | `pothole` | learned |
| crack | `longitudinal_crack` / `transverse_crack` / `alligator_crack` | **heuristic** from box aspect ratio |
| manhole | `manhole_cover` / `sewage_hole` | **heuristic** from crop brightness |

Only the three top-level classes are learned. The subtype split is a deterministic rule,
so no per-subtype metric exists and none should be claimed.

## 2. RDD2022 (alternative, untested in this repository)

The conversion scripts exist but no RDD2022 data is bundled and the path below has not
been executed end-to-end here:

```bash
python -m ml.datasets.convert_voc_to_yolo --input datasets/raw/rdd2022 --output datasets/processed/rdd2022
python -m ml.datasets.validate --dataset-dir datasets/processed/rdd2022
python -m ml.detection.train --dataset datasets/processed/rdd2022 --epochs 50 --batch 8 --device cpu
```

`ml.detection.train` writes `models/detection/best.pt` directly. Use it only after placing
RDD2022 under `datasets/raw/rdd2022`.

## 3. Authenticity classifier training

```bash
python -m ml.authenticity.train --dataset datasets/processed/authenticity --epochs 30
```

Checkpoints are saved to `models/authenticity/best.pt`. No authenticity dataset is
bundled, so this path has not been run here.

## 4. HTTP training endpoints

`POST /api/v1/training/detection/start` and `/authenticity/start` intentionally answer
**501**. Training is a long, CPU-bound batch job, not a request/response operation; the
API points at the CLI commands above rather than pretending a job started.
