#!/usr/bin/env python3
"""
Convert Pascal VOC XML annotations to YOLO TXT format.
RDD2022 uses VOC format; this converts to YOLO for training.

CLASS MAPPING (official RDD2022):
  D00 → 0 (Longitudinal Crack)
  D10 → 1 (Transverse Crack)
  D20 → 2 (Alligator Crack)
  D40 → 3 (Pothole)

Usage: python -m ml.datasets.convert_voc_to_yolo --input datasets/raw/rdd2022 --output datasets/processed/rdd2022
"""
import xml.etree.ElementTree as ET
from pathlib import Path
import argparse
import os
import shutil

CLASS_MAP = {"D00": 0, "D10": 1, "D20": 2, "D40": 3}
CLASS_NAMES = {0: "D00_Longitudinal_Crack", 1: "D10_Transverse_Crack", 2: "D20_Alligator_Crack", 3: "D40_Pothole"}


def convert_voc_to_yolo(xml_path):
    """Parse a VOC XML file and return YOLO format lines."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    size = root.find("size")
    img_w = int(size.find("width").text)
    img_h = int(size.find("height").text)

    yolo_lines = []
    for obj in root.findall("object"):
        class_name = obj.find("name").text
        if class_name not in CLASS_MAP:
            continue
        class_id = CLASS_MAP[class_name]
        bnd = obj.find("bndbox")
        xmin = float(bnd.find("xmin").text)
        ymin = float(bnd.find("ymin").text)
        xmax = float(bnd.find("xmax").text)
        ymax = float(bnd.find("ymax").text)

        cx = ((xmin + xmax) / 2) / img_w
        cy = ((ymin + ymax) / 2) / img_h
        w = (xmax - xmin) / img_w
        h = (ymax - ymin) / img_h

        # Clamp to [0, 1]
        cx, cy, w, h = [max(0.0, min(1.0, v)) for v in [cx, cy, w, h]]
        yolo_lines.append(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

    return yolo_lines, img_w, img_h


def convert_dataset(input_dir, output_dir):
    """Convert entire VOC dataset to YOLO format."""
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)

    xml_files = list(input_dir.rglob("*.xml"))
    print(f"Found {len(xml_files)} XML annotation files")

    converted = 0
    errors = 0
    skipped = 0

    for xml_path in xml_files:
        try:
            yolo_lines, w, h = convert_voc_to_yolo(xml_path)
            if not yolo_lines:
                skipped += 1
                continue

            rel_path = xml_path.relative_to(input_dir)
            out_label = output_dir / "labels" / rel_path.with_suffix(".txt")
            out_label.parent.mkdir(parents=True, exist_ok=True)

            with open(out_label, "w") as f:
                f.write("\n".join(yolo_lines))

            # Copy corresponding image
            for ext in [".jpg", ".jpeg", ".png"]:
                img_src = xml_path.with_suffix(ext)
                if img_src.exists():
                    out_img = output_dir / "images" / rel_path.with_suffix(ext)
                    out_img.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(img_src, out_img)
                    break

            converted += 1
        except Exception as e:
            print(f"Error converting {xml_path}: {e}")
            errors += 1

    print(f"Converted: {converted}, Skipped (no damage): {skipped}, Errors: {errors}")
    return converted


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    convert_dataset(args.input, args.output)
