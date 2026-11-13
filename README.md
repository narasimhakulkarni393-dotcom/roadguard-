# RoadGuard AI — AI-Powered Road Damage Detection & Infrastructure Intelligence Platform

RoadGuard AI is an infrastructure inspection platform engineered for detecting, localizing, measuring, and analyzing road damage (potholes and cracks) using deep learning and explainable computer vision.

Built according to the international **CRDDC RDD2022** road damage benchmark.

---

## 🌟 Key Features

1. **8-Stage AI Intelligence Pipeline**:
   - **Stage 1 (Image Validation)**: EXIF orientation correction, dimension recording, cryptographic MD5 hashing, Laplacian blur detection, and photometric exposure evaluation.
   - **Stage 2 (Authenticity Screening)**: Multi-factor heuristic & ML analysis to assess whether an image is natural, camera-captured, or synthetic/manipulated.
   - **Stage 3 (Damage Detection)**: YOLOv8 object detection targeting CRDDC classes:
     - `D00`: Longitudinal Crack
     - `D10`: Transverse Crack
     - `D20`: Alligator Crack
     - `D40`: Pothole
   - **Stage 4 (Localization & Visual Overlays)**: Interactive SVG bounding box rendering with class-coded colors, confidence labels, and side-by-side comparison slider.
   - **Stage 5 (Dimensional Measurement)**: Pixel area, bounding width/height, shape aspect ratios, and relative damage percentages.
   - **Stage 6 (Explainable Severity Scoring)**: Multi-factor scoring (0–100) and categorical grading (LOW, MODERATE, HIGH, CRITICAL).
   - **Stage 7 (Engineering Cause Diagnostics)**: Hypotheses regarding pavement distress mechanisms (water ingress, subgrade fatigue, thermal stress).
   - **Stage 8 (Remediation & Reporting)**: Structured inspection dossiers with printable PDF layout and inspection history.

2. **Technology Stack**:
   - **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion, Recharts, Lucide Icons, React Dropzone, React Compare Slider.
   - **Backend**: FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2.0 (SQLite WAL mode locally, PostgreSQL ready), OpenCV, Pillow, PyTorch, Ultralytics YOLOv8.
   - **Training Pipeline**: Independent CLI scripts for Pascal VOC to YOLO conversion, dataset validation, YOLOv8 fine-tuning, and model evaluation.

---

## 🚀 Quick Start

### 1. Backend Setup
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Docs available at: `http://localhost:8000/docs`  
Health check: `http://localhost:8000/api/v1/health`

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev -- --port 3000
```
Open in browser: `http://localhost:3000`

---

## 🔬 Dataset & Training

RoadGuard AI uses the **RDD2022** multi-national road damage dataset (CC BY 4.0).

To train the YOLOv8 detection model:
```bash
# 1. Convert dataset from Pascal VOC to YOLO format
python -m ml.datasets.convert_voc_to_yolo --input datasets/raw/rdd2022 --output datasets/processed/rdd2022

# 2. Run detection training
python -m ml.detection.train --dataset datasets/processed/rdd2022 --epochs 50 --batch 8 --device cpu
```
When trained, place the resulting `best.pt` in `models/detection/best.pt`. The backend automatically loads it.

---

## 🛡️ License & Attributions
- Dataset: RDD2022 / Sekilab (CC BY 4.0)
- Platform: RoadGuard AI (MIT)
