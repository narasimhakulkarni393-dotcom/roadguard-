# Model Card — RoadGuard AI Damage Detector

## Deployment providers

The damage detector can run in three modes, selected by `DETECTION_PROVIDER`:

- `yolo` — local Ultralytics YOLOv8 weights (`models/detection/best.pt`).
- `hf-inference` — remote object detection through the Hugging Face Inference API
  (`huggingface_hub.InferenceClient`, `provider="hf-inference"`). Requires `HF_TOKEN`; the model
  is set by `HF_DETECTION_MODEL_ID` (default `facebook/detr-resnet-50`).
- `gemini` — Gemini vision (`GEMINI_MODEL_ID`, default `gemini-2.5-flash`) constrained by a
  JSON schema containing only the six taxonomy labels. Requires `GEMINI_API_KEY`. Gemini is a
  general vision LLM, not a trained object detector: its boxes and confidences are self-reported,
  uncalibrated, and have not been evaluated against a labelled road-damage set. HTTP errors,
  safety blocks and malformed JSON return `model_ready: false`, never an empty success.

`facebook/detr-resnet-50` is trained on COCO (person, car, cat, …), which contains **no
road-damage classes**. With that model the API returns zero defects and records the raw labels
under `ignored_labels`; it never relabels a COCO object as a pothole. A model id trained on road
damage is required for useful detections. Remote API errors surface as `model_ready: false`
with the provider message — they are not reported as "no damage found". No accuracy claim is
made for either provider, and neither has been evaluated on a labelled road-damage set.

## Model Details
- **Developer**: RoadGuard AI Team
- **Model Architecture**: Ultralytics YOLOv8n, fine-tuned from the bundled `yolov8n.pt`
- **Task**: 2D object detection for pavement defects
- **Input Resolution**: trained at 480 px (native dataset images are 640×360)
- **Learned classes**: `pothole`, `crack`, `manhole` (the dataset's three classes)
- **API taxonomy**: six canonical labels; crack subtype and manhole-vs-open-sewage are
  derived by deterministic rules, not learned (see `docs/TRAINING_GUIDE.md`)

## Training data
- **Source**: Kaggle [Road Damage Dataset: Potholes, Cracks and Manholes](https://www.kaggle.com/datasets/lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes),
  version 4, MIT per Kaggle metadata, citation [doi:10.5281/zenodo.17834373](https://doi.org/10.5281/zenodo.17834373).
- **Content**: 2,009 images, 4,733 valid boxes (1,261 pothole / 2,517 crack / 955 manhole);
  four malformed label lines dropped and recorded in the manifest.
- **Splits**: seeded (42) stratified 80/10/10 — 1,607 train / 201 val / 201 test images.
  The test split is never used for training or checkpoint selection.
- **Provenance and counts**: `datasets/processed/kaggle_road_damage/manifest.json`
  (generated; the corpus itself is git-ignored).

## Intended Use
- **Primary Use**: Assistance in road network asset management, surveying, prioritizing repairs.
- **Out-of-Scope**: Autonomous vehicle steering or high-speed emergency collision avoidance.

## Factors and Limitations
- 2D monocular RGB bounding boxes cannot measure depth or volume without 3D LiDAR/stereo calibration.
- Heavy rainfall, standing water, and extreme night glare can degrade bounding box precision.
- **No evaluation metrics are published for the bundled checkpoint.** No labelled evaluation
  split was supplied, so precision/recall/mAP are unknown and must not be quoted.
- Detector confidence values are raw model outputs, not calibrated probabilities. The API
  carries an uncertainty note with every severity assessment.
- Severity and probable causes are deterministic rules over pixel geometry; they are
  explanations, not ground-truth engineering diagnoses.
- The authenticity stage currently runs as a heuristic (`authenticity_model_ready: false`);
  `models/authenticity/best.pt` is not bundled.
- In video mode only sampled frames are inspected (default 2 fps, max 300); defects visible
  only between samples are missed.
