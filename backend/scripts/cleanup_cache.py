import os
import json
import re
from pathlib import Path

# Path to cache (updated hash from logs: 5ddfe2759a00dd27)
CACHE_DIR = Path(".ocr_cache/5ddfe2759a00dd27/pages")

graph_keywords = ["graph", "chart", "scatter", "figure", "shown", "coordinate plane", "xy-plane", "x-y plane"]

count = 0
deleted = []

if not CACHE_DIR.exists():
    print(f"Cache dir {CACHE_DIR} not found.")
    exit(1)

print(f"Scanning {CACHE_DIR} for missing graphs...")

for cache_file in CACHE_DIR.glob("page_*.json"):
    with open(cache_file, "r") as f:
        data = json.load(f)
    
    # Skip if not a question page
    if not data.get("is_question"):
        continue
        
    # Skip if graphs were found (it worked)
    if data.get("graphs") and len(data.get("graphs")) > 0:
        continue
        
    text = data.get("ocr_markdown", "").lower()
    
    # Check for keywords
    found_keyword = None
    for kw in graph_keywords:
        if kw in text:
            found_keyword = kw
            break
            
    if found_keyword:
        # Check if it was "shown above/below" context vs just the word "graph"
        # Optional: tighten logic. But for safety, let's just clear suspects.
        print(f"Page {data['page_num']}: Found '{found_keyword}' but no graphs detected. Deleting cache.")
        deleted.append(data['page_num'])
        
        # Delete the file
        os.remove(cache_file)
        count += 1

print(f"\nDone. Deleted {count} flawed cache files.")
print(f"Pages: {sorted(deleted)}")
