import json
from pathlib import Path

CACHE_DIR = Path(".ocr_cache/5ddfe2759a00dd27/pages")

print(f"Scanning {CACHE_DIR}...")

skipped_pages = []
empty_questions_pages = []
total_questions = 0

for i in range(1, 102):
    cache_file = CACHE_DIR / f"page_{i}.json"
    if not cache_file.exists():
        print(f"Page {i}: MISSING CACHE FILE")
        continue

    with open(cache_file, "r") as f:
        data = json.load(f)
    
    if not data.get("is_question"):
        skipped_pages.append(i)
    else:
        q_list = data.get("questions", [])
        if not q_list:
            empty_questions_pages.append(i)
        else:
            total_questions += len(q_list)

print(f"\nTotal questions found: {total_questions}")
print(f"Pages skipped (No question detected): {skipped_pages}")
print(f"Pages with is_question=True but NO questions extracted: {empty_questions_pages}")

# Analyze skipped pages content (first 100 chars)
print("\n--- Snippets from Skipped Pages ---")
for p in skipped_pages:
    cache_file = CACHE_DIR / f"page_{p}.json"
    with open(cache_file, "r") as f:
        data = json.load(f)
    print(f"Page {p} preview: {data.get('ocr_markdown', '')[:100].replace(chr(10), ' ')}...")
