"""Validate bounding box coordinate bounds and annotation integrity."""
from pathlib import Path

def validate():
    workspace = Path(__file__).resolve().parent.parent
    labels_dir = workspace / "datasets" / "processed" / "kaggle_road_damage" / "labels"
    
    total_labels = 0
    invalid_lines = 0
    
    for split in ["train", "val"]:
        split_dir = labels_dir / split
        if not split_dir.exists():
            continue
        for lbl in split_dir.glob("*.txt"):
            total_labels += 1
            with open(lbl, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        invalid_lines += 1
                        continue
                    cls_id, xc, yc, w, h = map(float, parts)
                    if not (0 <= xc <= 1 and 0 <= yc <= 1 and 0 <= w <= 1 and 0 <= h <= 1):
                        invalid_lines += 1
                        
    print(f"Annotation validation completed: {total_labels} files scanned. Invalid lines: {invalid_lines}")

if __name__ == "__main__":
    validate()
