# Model Card — RoadGuard AI Damage Detector

## Model Details
- **Developer**: RoadGuard AI Team
- **Model Architecture**: Ultralytics YOLOv8 (yolov8n / yolov8s backbone)
- **Task**: 2D Object Detection for Pavement Defects
- **Input Resolution**: 640x640 RGB images
- **Classes**: D00 (Longitudinal), D10 (Transverse), D20 (Alligator), D40 (Pothole)

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
