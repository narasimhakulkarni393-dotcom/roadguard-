# Dataset Attribution and Provenance

## 1. Kaggle Road Damage Dataset (used for the bundled detector)

- **Title**: Road Damage Dataset: Potholes, Cracks and Manholes
- **Kaggle**: [lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes](https://www.kaggle.com/datasets/lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes)
- **License**: MIT (per Kaggle dataset metadata)
- **Citation (dataset README)**: [https://doi.org/10.5281/zenodo.17834373](https://doi.org/10.5281/zenodo.17834373)
- **Resolved version used**: 4 (via `kagglehub` public download, no credentials)
- **Content**: 2,009 JPEG images at 640×360 with axis-aligned YOLO boxes; 4,733 valid
  instances — 1,261 pothole, 2,517 crack, 955 manhole. Four malformed label lines were
  dropped and counted in `datasets/processed/kaggle_road_damage/manifest.json`.

### Classes
| Class ID | Name | Backend mapping |
|---|---|---|
| 0 | Pothole | `pothole` (learned) |
| 1 | Crack | `longitudinal_crack` / `transverse_crack` / `alligator_crack` (heuristic by aspect ratio) |
| 2 | Manhole | `manhole_cover` / `sewage_hole` (heuristic by crop brightness) |

### Provenance notes
- Acquisition details come from the dataset README (vehicle-mounted GoPro and smartphone,
  1.2–1.5 m height, 10–15° tilt, downsampled to 640×360, daylight/dry-to-mild conditions).
  The README names its collection regions only as "Region X and Y", so geographic coverage
  cannot be verified from the dataset itself.
- The test split (201 images) is held out; it is not used for training or checkpoint
  selection. Splits are reproducible with `--seed 42`.
- Original submission data is not modified by the preparation script; it copies label and
  image pairs into `datasets/processed/` (git-ignored).

## 2. RDD2022 — The Multi-National Road Damage Dataset
- **Official Title**: RDD2022: Multi-National Road Damage Dataset released through CRDDC 2022
- **Authors**: Sekilab, The University of Tokyo
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Official GitHub**: [https://github.com/sekilab/RoadDamageDetector](https://github.com/sekilab/RoadDamageDetector)
- **Figshare DOI**: [10.6084/m9.figshare.21431547](https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547)

### Class Mapping (CRDDC Standard):
| Code | Class Name | Description |
|---|---|---|
| **D00** | Longitudinal Crack | Cracks parallel to the vehicle driving lane |
| **D10** | Transverse Crack | Cracks perpendicular to the vehicle driving lane |
| **D20** | Alligator Crack | Interconnected pattern resembling alligator skin |
| **D40** | Pothole | Pavement surface depression / cavity |

No RDD2022 data is bundled in this repository.

## 3. GenImage Dataset
- **Official Title**: GenImage: A Million-Scale Benchmark for Detecting AI-Generated Image
- **Official GitHub**: [https://github.com/GenImage-Dataset/GenImage](https://github.com/GenImage-Dataset/GenImage)
- **License**: Research Use Only
- **Intended Use**: Benchmarking synthetic vs. natural road photography

