import os
import json
import base64
import asyncio
import httpx
import hashlib
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime
import fitz  # PyMuPDF
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from PIL import Image

# Providers Configuration
PROVIDERS = {
    "deepinfra": {
        "url": "https://api.deepinfra.com/v1/openai/chat/completions",
        "key": os.getenv("DEEPINFRA_API_KEY"),
        "models": {
            "vision": "allenai/olmOCR-2-7B-1025",
            "detection": "Qwen/Qwen2.5-VL-32B-Instruct",
            "llm": "deepseek-ai/DeepSeek-V3.1"
        }
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "key": os.getenv("OPENAI_API_KEY"),
        "models": {
            "vision": "gpt-4o-mini",
            "detection": "gpt-4o-mini",
            "llm": "gpt-4o-mini"
        }
    },
    "hybrid": {
        # Best of all worlds:
        # - OpenAI for OCR (stable, no 500 errors)
        # - DeepInfra Qwen for detection (best bounding boxes, cheap)
        # - DeepInfra DeepSeek for structuring (accurate JSON)
        "ocr_url": "https://api.openai.com/v1/chat/completions",
        "ocr_key": os.getenv("OPENAI_API_KEY"),
        "detection_url": "https://api.deepinfra.com/v1/openai/chat/completions",
        "detection_key": os.getenv("DEEPINFRA_API_KEY"),
        "llm_url": "https://api.deepinfra.com/v1/openai/chat/completions",
        "llm_key": os.getenv("DEEPINFRA_API_KEY"),
        "models": {
            "vision": "gpt-4o-mini",
            "detection": "Qwen/Qwen2.5-VL-32B-Instruct",
            "llm": "deepseek-ai/DeepSeek-V3.1"
        }
    }
}

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000/api/v1")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")


# =============================================================================
# CACHE MANAGER - Checkpoint/Resume System
# =============================================================================
@dataclass
class PageCache:
    """Cached result for a single page."""
    page_num: int
    ocr_markdown: str
    is_question: bool
    graphs: List[Dict[str, Any]]
    questions: List[Dict[str, Any]]
    processed_at: str

class CacheManager:
    """
    Manages checkpoint/resume functionality for PDF processing.
    Stores intermediate results so processing can continue after failures.
    """
    
    def __init__(self, pdf_path: str, output_dir: str = ".ocr_cache"):
        self.pdf_path = pdf_path
        self.pdf_hash = self._get_file_hash(pdf_path)
        self.cache_dir = Path(output_dir) / self.pdf_hash[:16]
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.progress_file = self.cache_dir / "progress.json"
        self.pages_dir = self.cache_dir / "pages"
        self.pages_dir.mkdir(exist_ok=True)
        
    def _get_file_hash(self, filepath: str) -> str:
        """Generate a hash of the PDF file for cache identification."""
        hasher = hashlib.md5()
        with open(filepath, 'rb') as f:
            # Read in chunks for large files
            for chunk in iter(lambda: f.read(8192), b''):
                hasher.update(chunk)
        return hasher.hexdigest()
    
    def get_progress(self) -> Dict[str, Any]:
        """Load progress from cache."""
        if self.progress_file.exists():
            with open(self.progress_file) as f:
                return json.load(f)
        return {"processed_pages": [], "total_questions": 0, "started_at": None}
    
    def save_progress(self, processed_pages: List[int], total_questions: int):
        """Save current progress."""
        progress = {
            "processed_pages": processed_pages,
            "total_questions": total_questions,
            "pdf_path": self.pdf_path,
            "pdf_hash": self.pdf_hash,
            "updated_at": datetime.now().isoformat()
        }
        if not self.get_progress().get("started_at"):
            progress["started_at"] = datetime.now().isoformat()
        with open(self.progress_file, 'w') as f:
            json.dump(progress, f, indent=2)
    
    def get_page_cache(self, page_num: int) -> Optional[PageCache]:
        """Load cached result for a specific page."""
        cache_file = self.pages_dir / f"page_{page_num}.json"
        if cache_file.exists():
            with open(cache_file) as f:
                data = json.load(f)
                return PageCache(**data)
        return None
    
    def save_page_cache(self, cache: PageCache):
        """Save page result to cache."""
        self.pages_dir.mkdir(parents=True, exist_ok=True)  # Ensure dir exists
        cache_file = self.pages_dir / f"page_{cache.page_num}.json"
        with open(cache_file, 'w') as f:
            json.dump(asdict(cache), f, indent=2)
    
    def clear(self):
        """Clear all cache for this PDF."""
        import shutil
        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
            print(f"🗑️  Cleared cache: {self.cache_dir}")
        # Recreate empty directories
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.pages_dir.mkdir(exist_ok=True)
    
    def get_stats(self) -> str:
        """Get cache statistics."""
        progress = self.get_progress()
        cached_pages = len(list(self.pages_dir.glob("page_*.json")))
        return f"Cache: {cached_pages} pages cached, {progress.get('total_questions', 0)} questions extracted"



async def extract_text_from_image(image_base64: str, model: str, provider_config: Dict[str, Any]) -> str:
    """Vision LLM OCR: Extract Markdown from SAT page image.
    
    Prompt optimized for caching:
    - System message = static (cached across pages)
    - User message = dynamic (image changes per page)
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {provider_config['key']}"
    }
    
    # STATIC: Cached system instruction (~60 tokens)
    system_prompt = """SAT exam OCR extractor. Output clean Markdown.
Rules: 1) Extract all text including question numbers, options A-D  2) LaTeX: use $ for inline, $$ for block  3) Tables: output as HTML  4) Graphs: describe briefly  5) Ignore watermarks"""
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all text from this SAT page:"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                ]
            }
        ],
        "max_tokens": 4096
    }
    
    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(provider_config['url'], headers=headers, json=payload, timeout=120.0)
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt < 2:
                print(f"  ⚠️ OCR error ({type(e).__name__}), retrying... ({attempt + 1}/3)")
                await asyncio.sleep(2)
                continue
            raise
    return ""

async def detect_graphs(image_base64: str, model: str, provider_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Detect graphs/diagrams (NOT tables) and return bounding boxes.
    
    Prompt optimized for caching:
    - System message = static detection rules (cached)
    - User message = dynamic image
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {provider_config['key']}"
    }
    
    # STATIC: Cached system instruction (~70 tokens)
    system_prompt = """Graph detector for SAT exams. Return JSON with bounding boxes.
DETECT: Graphs, coordinate planes, charts, geometric diagrams, scientific figures
SKIP: Tables (OCR extracts as text), text passages, answer choices
Format: {"figures": [{"label": "description", "x_min": 0-1000, "y_min": 0-1000, "x_max": 0-1000, "y_max": 0-1000}]}
Coordinates are 0-1000 scale (0=left/top, 1000=right/bottom).
If no graphs found: {"figures": []}"""
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Find graphs/diagrams (not tables):"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                ]
            }
        ],
        "response_format": {"type": "json_object"}
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(provider_config['url'], headers=headers, json=payload, timeout=120.0)
            response.raise_for_status()
            data = response.json()["choices"][0]["message"]["content"]
            result = json.loads(data)
            figures = result.get("figures", [])
            normalized = []
            
            for fig in figures:
                if all(k in fig for k in ["x_min", "y_min", "x_max", "y_max"]):
                    # Handle different scales automatically
                    vals = [fig["x_min"], fig["y_min"], fig["x_max"], fig["y_max"]]
                    max_val = max(vals)
                    
                    scale_factor = 1.0
                    if max_val > 1000:
                        # Fallback: Model is using some arbitrary large scale (e.g. pixel coords > image size)
                        # We try to normalize so the largest value fits in 1000.
                        # This isn't perfect but better than discarding or clamping to 0-width.
                        scale_factor = 1000.0 / max_val
                    elif max_val <= 100:
                        # Likely 0-100 percentage
                        scale_factor = 10.0
                    
                    # Apply scale and clamp to 0-1000
                    x_min = max(0, min(1000, int(fig["x_min"] * scale_factor)))
                    y_min = max(0, min(1000, int(fig["y_min"] * scale_factor)))
                    x_max = max(0, min(1000, int(fig["x_max"] * scale_factor)))
                    y_max = max(0, min(1000, int(fig["y_max"] * scale_factor)))
                    
                    # Ensure validity (min < max)
                    if x_min >= x_max or y_min >= y_max:
                        print(f"  ⚠️ Invalid bbox ignored: {fig}")
                        continue
                        
                    normalized.append({
                        "label": fig.get("label", "graph"),
                        "bbox": [y_min, x_min, y_max, x_max]  # Correct order for crop function
                    })
                    # bbox format in memory: [ymin, xmin, ymax, xmax] (0-1000 scale)
                    normalized[-1]["bbox"] = [y_min, x_min, y_max, x_max]

            return normalized
    except Exception as e:
        print(f"Graph detection failed: {e}")
        return []


def crop_and_save_figure(original_image_path: str, bbox: List[int], output_path: str):
    """Crops an image based on normalized 1000x1000 coordinates."""
    with Image.open(original_image_path) as img:
        width, height = img.size
        # ymin, xmin, ymax, xmax
        ymin, xmin, ymax, xmax = bbox
        
        left = xmin * width / 1000
        top = ymin * height / 1000
        right = xmax * width / 1000
        bottom = ymax * height / 1000
        
        # Add a small padding
        padding = 10
        left = max(0, left - padding)
        top = max(0, top - padding)
        right = min(width, right + padding)
        bottom = min(height, bottom + padding)
        
        img.crop((left, top, right, bottom)).save(output_path)
        print(f"Saved cropped figure to {output_path}")

async def parse_markdown_to_json(markdown_text: str, model: str, graph_files: List[str], provider_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert OCR markdown to structured JSON.
    
    Prompt optimized for caching:
    - System message = static schema/rules (cached across pages, ~150 tokens)
    - User message = dynamic OCR text + detected images (changes per page)
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {provider_config['key']}"
    }
    
    # STATIC: Cached system instruction with JSON schema (~150 tokens)
    system_prompt = """SAT question extractor. Convert OCR text to JSON.

{"questions": [{
  "passage_text": "EBRW reading passage only, empty for Math",
  "question_text": "The actual question only",
  "question_type": "multiple_choice|student_produced_response",
  "chart_title": "Table/chart title if present",
  "chart_data": "HTML table from OCR if present",
  "needs_image": true, 
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": ["D"],
  "explanation": "Brief explanation",
  "domain": "Algebra|Advanced Math|Geometry and Trigonometry|Problem Solving and Data Analysis|Craft and Structure|Information and Ideas|Expression of Ideas|Standard English Conventions",
  "difficulty": "Easy|Medium|Hard"
}]}

RULES:
1. passage_text = reading passage; question_text = actual question only
2. chart_title = table/graph title; chart_data = OCR-extracted table HTML
3. set needs_image=true if text mentions 'graph', 'figure', 'scatter', 'shown', or implies visual data is needed.
4. correct_answer = ALWAYS determine the correct answer by analyzing the question and options. Use reasoning to identify the best answer. Only use "[NEED_ANSWER]" if truly impossible to determine.
5. explanation = Explain WHY the correct answer is right.
Return valid JSON only."""

    # DYNAMIC: Per-page content
    graph_list = ", ".join([os.path.basename(f) for f in graph_files]) if graph_files else "none"
    user_content = f"Images: {graph_list}\n\nOCR TEXT:\n{markdown_text}"
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "response_format": {"type": "json_object"}
    }
    
    # Retry logic for API calls
    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(provider_config['url'], headers=headers, json=payload, timeout=180.0)
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                data = json.loads(content)
                if isinstance(data, dict) and "questions" in data:
                    return data["questions"]
                return data if isinstance(data, list) else [data]
        except httpx.ReadTimeout:
            if attempt < 2:
                print(f"  Timeout, retrying... ({attempt + 1}/3)")
                continue
            raise
    return []

import re

def _is_question_page(markdown_text: str) -> bool:
    """
    Checks if the OCR output contains patterns that indicate an SAT question.
    This helps skip ads, blank pages, and answer key pages to save API costs.
    """
    text = markdown_text.lower()
    
    # Minimum text length check (too short = likely blank or just watermark)
    if len(text.strip()) < 50:
        return False
    
    # Patterns that indicate a question page
    question_indicators = [
        r'mark\s+for\s+review',             # SAT specific (handles variable whitespace)
        r'question\s+\d+',                 # "Question 1"
        r'\b(a\)|b\)|c\)|d\))',          # Answer choices: A), B), C), D)
        r'\b(a\.|b\.|c\.|d\.)',          # Answer choices: A., B., C., D.
        r'\bwhat is\b',                   # "What is..."
        r'\bwhich of\b',                  # "Which of the following..."
        r'\bif\s+.+\s*=',                 # "If x = ..."
        r'\bsolve\b',    
        r'\bwhich\b',
        r'\bwhat\b',
        r'\bhow\b',
        r'\bmany\b',
        r'\bwhere\b',
        r'\bwhen\b',
        r'\bwhy\b',
        r'\bfor\b',
        r'\bfrom\b',
        r'\bfind\b',                  # "Find the..."
        r'\bthe value of\b',              # "...the value of..."
        r'\bequation\b',                  # Mentions equation
        r'\bgraph\b',                     # Mentions graph
        r'\bfunction\b',                  # Mentions function
        r'\$.*\$',                        # Contains LaTeX math
        r'\\frac\{',                      # LaTeX fraction
        r'\\sqrt\{',                      # LaTeX square root
    ]
    
    # Patterns that indicate NOT a question page
    non_question_indicators = [
        r'^answer\s*key',                 # Answer key page
        r'advertisement',                  # Ad page
        # r't\.me/',                       # REMOVED: Watermarks shouldn't skip the page
        # r'@\w+sat',                      # REMOVED: Social handles shouldn't skip
        r'^instructions?:?\s*$',          # Instructions page
    ]
    
    # Check for non-question indicators first
    for pattern in non_question_indicators:
        if re.search(pattern, text):
            return False
    
    # Check for question indicators
    for pattern in question_indicators:
        if re.search(pattern, text):
            return True
    
    # Default: assume it's a question if we have substantial text
    return len(text.strip()) > 150


def get_page_image(doc, page_num: int, output_dir: str) -> str:
    """Converts a single PDF page to image on demand."""
    page = doc.load_page(page_num - 1)  # 0-indexed in PyMuPDF
    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3)) # High res for cropping
    image_path = os.path.join(output_dir, f"page_{page_num}.jpg")
    pix.save(image_path)
    return image_path

async def upload_questions(module_id: int, questions: List[Dict[str, Any]]):
    """Automatically uploads extracted questions to the backend."""
    if not ADMIN_TOKEN:
        print("Warning: ADMIN_TOKEN not set. Skipping automatic upload.")
        return

    headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "module_id": module_id,
        "questions": questions
    }
    
    async with httpx.AsyncClient() as client:
        url = f"{BACKEND_URL}/questions/bulk-import"
        print(f"Uploading {len(questions)} questions to {url}...")
        response = await client.post(url, headers=headers, json=payload, timeout=30.0)
        if response.status_code == 200:
            print(f"Successfully imported {response.json()['imported']} questions.")
        else:
            print(f"Failed to import: {response.text}")

async def process_pdf(pdf_path: str, output_json: str, vision_model: str, detection_model: str, llm_model: str, provider: str, module_id: Optional[int] = None, max_pages: Optional[int] = None, specific_pages: Optional[List[int]] = None, clear_cache: bool = False):
    """
    Main pipeline: PDF -> Images -> OCR -> Detect Graphs -> Crop -> Structure -> JSON.
    """
    provider_config = PROVIDERS[provider]
    
    # Handle hybrid mode - separate configs for OCR, detection, and LLM
    if provider == "hybrid":
        ocr_config = {"url": provider_config["ocr_url"], "key": provider_config["ocr_key"]}
        detection_config = {"url": provider_config["detection_url"], "key": provider_config["detection_key"]}
        llm_config = {"url": provider_config["llm_url"], "key": provider_config["llm_key"]}
        if not ocr_config["key"]:
            raise ValueError("OPENAI_API_KEY is required for hybrid mode (OCR)")
        if not detection_config["key"] or not llm_config["key"]:
            raise ValueError("DEEPINFRA_API_KEY is required for hybrid mode (Detection/LLM)")
    else:
        ocr_config = {"url": provider_config["url"], "key": provider_config["key"]}
        detection_config = {"url": provider_config["url"], "key": provider_config["key"]}
        llm_config = {"url": provider_config["url"], "key": provider_config["key"]}
        if not provider_config.get("key"):
            raise ValueError(f"API Key for provider '{provider}' is missing from .env")
    temp_dir = "temp_ocr_images"
    os.makedirs(temp_dir, exist_ok=True)
    extracted_graphs_dir = "extracted_graphs"
    os.makedirs(extracted_graphs_dir, exist_ok=True)
    
    # Initialize cache manager
    cache = CacheManager(pdf_path)
    
    if clear_cache:
        cache.clear()
    
    print(f"\n{'='*60}")
    print(f"📄 Processing: {pdf_path}")
    print(f"{'='*60}")
    print(f"📊 {cache.get_stats()}")
    
    print(f"📊 {cache.get_stats()}")
    
    # Initialize variables early to prevent UnboundLocalError
    processed_pages = set()
    all_questions = []
    
    doc = None
    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        
        # Select pages to process
        selected_indices = []
        if specific_pages:
            selected_indices = [p - 1 for p in specific_pages if 0 < p <= total_pages]
        elif max_pages:
            selected_indices = list(range(min(max_pages, total_pages)))
        else:
            selected_indices = list(range(total_pages))
        
        # Load existing progress
        progress = cache.get_progress()
        processed_pages = set(progress.get("processed_pages", []))
        
        all_markdown = []
        skipped_pages = 0
        cached_pages = 0
        
        for idx in selected_indices:
            page_num = idx + 1
            
            # Check if page is already cached
            page_cache = cache.get_page_cache(page_num)
            if page_cache:
                print(f"\n--- Page {page_num} [CACHED] ---")
                all_markdown.append(f"--- PAGE {page_num} ---\n\n{page_cache.ocr_markdown}\n")
                all_questions.extend(page_cache.questions)
                cached_pages += 1
                continue
            
            print(f"\n--- Page {page_num} ---")
            
            # Convert page to image ON DEMAND (lazy loading)
            img_path = get_page_image(doc, page_num, temp_dir)
            
            with open(img_path, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")
            
            # 1. Extract text with OCR FIRST (cheapest call)
            print(f"  📝 Extracting text (OCR)...")
            markdown = await extract_text_from_image(img_b64, vision_model, ocr_config)
            all_markdown.append(f"--- PAGE {page_num} ---\n\n{markdown}\n")
            
            # 2. Check if this page contains a question (COST SAVER)
            is_question = _is_question_page(markdown)
            if not is_question:
                print(f"  ⏭️  No question detected, skipping expensive calls...")
                skipped_pages += 1
                # Cache parameters same as before
                cache.save_page_cache(PageCache(
                    page_num=page_num,
                    ocr_markdown=markdown,
                    is_question=False,
                    graphs=[],
                    questions=[],
                    processed_at=datetime.now().isoformat()
                ))
                processed_pages.add(page_num)
                cache.save_progress(list(processed_pages), len(all_questions))
                continue
            
            # 3. Detect and Crop Graphs/Tables (DISABLED to save costs - User Request)
            # print(f"  🔍 Detecting graphs/tables...")
            # figures = await detect_graphs(img_b64, detection_model, detection_config)
            figures = []
            page_graph_files = []
            # for i, fig in enumerate(figures):
            #     bbox = fig.get("bbox")
            #     if bbox and len(bbox) == 4:
            #         graph_filename = f"page_{page_num}_graph_{i+1}.jpg"
            #         graph_path = os.path.join(extracted_graphs_dir, graph_filename)
            #         crop_and_save_figure(img_path, bbox, graph_path)
            #         page_graph_files.append(graph_path)

            # 4. Structure into JSON (only if question found)
            print(f"  🧠 Structuring JSON...")
            questions = await parse_markdown_to_json(markdown, llm_model, page_graph_files, llm_config)
            all_questions.extend(questions)
            
            # 5. Save to cache after successful processing
            cache.save_page_cache(PageCache(
                page_num=page_num,
                ocr_markdown=markdown,
                is_question=True,
                graphs=figures,
                questions=questions,
                processed_at=datetime.now().isoformat()
            ))
            processed_pages.add(page_num)
            cache.save_progress(list(processed_pages), len(all_questions))
            print(f"  ✅ Saved to cache (checkpoint)")
        
        # Summary
        print(f"\n{'='*60}")
        print(f"📊 SUMMARY")
        print(f"{'='*60}")
        if cached_pages > 0:
            print(f"  � Loaded from cache: {cached_pages} pages")
        if skipped_pages > 0:
            print(f"  💰 Skipped non-question pages: {skipped_pages}")
        print(f"  ✅ Total questions extracted: {len(all_questions)}")
            
        # Save results
        ocr_output_file = output_json.rsplit(".", 1)[0] + "_ocr.md"
        with open(ocr_output_file, "w") as f:
            f.write("\n".join(all_markdown))

        with open(output_json, "w") as f:
            json.dump(all_questions, f, indent=2)
            
        print(f"\n🎉 SUCCESS! Saved {len(all_questions)} questions to {output_json}")
        print(f"📁 Extracted graphs are in '{extracted_graphs_dir}/'")
        print(f"📁 Cache stored in '{cache.cache_dir}/'")
        
        if module_id:
            await upload_questions(module_id, all_questions)
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print(f"💾 Progress saved! Run again to resume from page {len(processed_pages) + 1}")
        raise
        
    finally:
        # Cleanup page images
        if os.path.exists(temp_dir):
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)

if __name__ == "__main__":
    import sys
    import argparse
    
    # Model presets for different use cases
    PRESETS = {
        "fast": {
            "vision": "allenai/olmOCR-2-7B-1025",  # Best for academic/math documents
            "detection": "Qwen/Qwen2.5-VL-32B-Instruct",  # Gold standard for bounding boxes
            "llm": "deepseek-ai/DeepSeek-V3.1",
            "description": "Balanced speed and accuracy (recommended)"
        },
        "accurate": {
            "vision": "allenai/olmOCR-2-7B-1025",
            "detection": "Qwen/Qwen2.5-VL-32B-Instruct",
            "llm": "deepseek-ai/DeepSeek-V3.1-Terminus",
            "description": "Maximum accuracy for complex documents"
        },
        "cheap": {
            "vision": "deepseek-ai/DeepSeek-OCR",
            "detection": "meta-llama/Llama-3.2-11B-Vision-Instruct",
            "llm": "deepseek-ai/DeepSeek-V3",
            "description": "Lowest cost, good for simple documents"
        }
    }
    
    parser = argparse.ArgumentParser(
        description="SAT Question OCR Extraction Tool with Checkpoint/Resume",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage (auto-resumes if interrupted)
  python ocr_processor.py exam.pdf output.json

  # Process specific pages
  python ocr_processor.py exam.pdf output.json --page-list 64,65,66

  # Start fresh (clear cache)
  python ocr_processor.py exam.pdf output.json --clear-cache

  # Check cache status
  python ocr_processor.py exam.pdf output.json --show-cache
        """
    )
    parser.add_argument("pdf", help="Input SAT PDF file")
    parser.add_argument("output", help="Output JSON file")
    parser.add_argument("--module", type=int, help="Target module ID for direct upload")
    parser.add_argument("--preset", choices=PRESETS.keys(), default="fast", help="Model preset (fast/accurate/cheap)")
    parser.add_argument("--vision", help="Override vision model")
    parser.add_argument("--llm", help="Override LLM model")
    parser.add_argument("--pages", type=int, help="Limit processing to first N pages")
    parser.add_argument("--page-list", help="Comma-separated list of exact page numbers (e.g. 66,69)")
    parser.add_argument("--clear-cache", action="store_true", help="Clear cache and start fresh")
    parser.add_argument("--show-cache", action="store_true", help="Show cache status and exit")
    parser.add_argument("--provider", choices=PROVIDERS.keys(), default="deepinfra", help="API Provider (deepinfra/openai)")
    
    args = parser.parse_args()
    
    # Provider config
    provider_config = PROVIDERS[args.provider]
    
    # Show cache status if requested
    if args.show_cache:
        cache = CacheManager(args.pdf)
        progress = cache.get_progress()
        print(f"\n📊 Cache Status for: {args.pdf}")
        print(f"{'='*50}")
        print(f"  Cache directory: {cache.cache_dir}")
        print(f"  PDF hash: {cache.pdf_hash[:16]}...")
        print(f"  Processed pages: {len(progress.get('processed_pages', []))}")
        print(f"  Total questions: {progress.get('total_questions', 0)}")
        print(f"  Started: {progress.get('started_at', 'N/A')}")
        print(f"  Last updated: {progress.get('updated_at', 'N/A')}")
        
        # List cached pages
        cached_files = list(cache.pages_dir.glob("page_*.json"))
        if cached_files:
            print(f"\n  Cached pages: {', '.join(sorted([f.stem.replace('page_', '') for f in cached_files]))}")
        sys.exit(0)
    
    # Apply preset
    preset = PRESETS[args.preset]
    vision_model = args.vision or provider_config["models"]["vision"]
    detection_model = provider_config["models"]["detection"]
    llm_model = args.llm or provider_config["models"]["llm"]
    
    print(f"\n🔧 Configuration")
    print(f"{'='*50}")
    print(f"  Provider: {args.provider.upper()}")
    print(f"  Preset: {args.preset} ({preset['description']})")
    print(f"  OCR: {vision_model}")
    print(f"  Detection: {detection_model}")
    print(f"  Structuring: {llm_model}")
    if args.clear_cache:
        print(f"  ⚠️  Cache will be cleared")
    
    page_numbers = [int(p.strip()) for p in args.page_list.split(",")] if args.page_list else None
    
    # Validate API keys
    if args.provider == "hybrid":
        if not provider_config.get("ocr_key"):
            print("Error: OPENAI_API_KEY environment variable not set (required for hybrid OCR).")
            sys.exit(1)
        if not provider_config.get("llm_key"):
            print("Error: DEEPINFRA_API_KEY environment variable not set (required for hybrid structuring).")
            sys.exit(1)
    elif not provider_config.get("key"):
        print(f"Error: {args.provider.upper()}_API_KEY environment variable not set.")
        sys.exit(1)
        
    asyncio.run(process_pdf(
        args.pdf, 
        args.output, 
        vision_model, 
        detection_model, 
        llm_model, 
        args.provider,
        args.module, 
        args.pages, 
        page_numbers,
        args.clear_cache
    ))

