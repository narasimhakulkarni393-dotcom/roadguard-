#!/usr/bin/env python3
"""
Dataset download script for RoadGuard AI.
Supports RDD2022 from figshare and Roboflow exports.

Usage:
    python -m ml.datasets.download --source roboflow --api-key YOUR_KEY
    python -m ml.datasets.download --source rdd2022-sample
"""
import argparse
import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path
from datetime import datetime
import urllib.request

# Dataset configuration
DATASETS = {
    "rdd2022-sample": {
        "description": "RDD2022 sample subset for testing",
        "source": "manual",
        "licence": "CC BY 4.0",
        "classes": {
            "0": "D00_Longitudinal_Crack",
            "1": "D10_Transverse_Crack",
            "2": "D20_Alligator_Crack",
            "3": "D40_Pothole"
        },
        "annotation_format": "YOLO",
        "note": "Full dataset available at https://github.com/sekilab/RoadDamageDetector"
    }
}

def create_dataset_manifest(dataset_name, source_url, licence, image_count, annotation_count, classes, format_type, output_dir):
    """Create a JSON manifest for a dataset."""
    manifest = {
        "name": dataset_name,
        "created_at": datetime.utcnow().isoformat(),
        "source_url": source_url,
        "licence": licence,
        "image_count": image_count,
        "annotation_count": annotation_count,
        "classes": classes,
        "annotation_format": format_type,
        "processed_by": "RoadGuard AI Dataset Pipeline",
        "notes": []
    }
    output_path = Path(output_dir) / f"{dataset_name}_manifest.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest created: {output_path}")
    return manifest

def download_with_progress(url, dest_path):
    """Download a file with progress reporting."""
    def progress_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            print(f"\r  Progress: {percent:.1f}% ({downloaded/1024/1024:.1f} MB)", end="")
    urllib.request.urlretrieve(url, dest_path, reporthook=progress_hook)
    print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RoadGuard AI Dataset Downloader")
    parser.add_argument("--source", choices=list(DATASETS.keys()), default="rdd2022-sample")
    parser.add_argument("--output-dir", default="datasets/raw")
    args = parser.parse_args()

    dataset_info = DATASETS[args.source]
    print(f"Dataset: {args.source}")
    print(f"Licence: {dataset_info['licence']}")
    if "note" in dataset_info:
        print(f"Note: {dataset_info['note']}")
    print()

    if dataset_info["source"] == "manual":
        print("This dataset requires manual download.")
        print("Please follow the instructions in docs/DATASET_ATTRIBUTION.md")
        create_dataset_manifest(
            args.source,
            "https://github.com/sekilab/RoadDamageDetector",
            dataset_info["licence"],
            0, 0,
            dataset_info["classes"],
            dataset_info["annotation_format"],
            "datasets/manifests"
        )
