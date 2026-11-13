"""Check for duplicate images using MD5 hashing."""
import hashlib
from pathlib import Path

def check_duplicates():
    workspace = Path(__file__).resolve().parent.parent
    images_dir = workspace / "datasets" / "processed" / "kaggle_road_damage" / "images"
    
    seen_hashes = {}
    duplicates = []
    
    for img_path in images_dir.rglob("*.jpg"):
        with open(img_path, "rb") as f:
            h = hashlib.md5(f.read()).hexdigest()
        if h in seen_hashes:
            duplicates.append((img_path, seen_hashes[h]))
        else:
            seen_hashes[h] = img_path
            
    print(f"Scanned {len(seen_hashes)} unique images. Exact duplicates found: {len(duplicates)}")

if __name__ == "__main__":
    check_duplicates()
