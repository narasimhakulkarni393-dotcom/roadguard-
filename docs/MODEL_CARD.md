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
