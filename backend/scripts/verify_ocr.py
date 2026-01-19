import fitz
import os
import asyncio
from ocr_processor import process_pdf

def create_sample_pdf(path: str):
    doc = fitz.open()
    page = doc.new_page()
    
    # Add some SAT-like text
    text = """
    SAT Practice Test - Math Section
    
    1. If $2x + 5 = 15$, what is the value of $x$?
    (A) 2
    (B) 5
    (C) 10
    (D) 15
    
    2. A circle has a radius of 5. What is its area?
    (A) $5\pi$
    (B) $10\pi$
    (C) $25\pi$
    (D) $50\pi$
    """
    
    page.insert_text((50, 50), text, fontsize=12)
    
    # Add a rectangle to simulate a figure
    page.draw_rect([50, 200, 150, 300], color=(0, 0, 1), fill=(0.8, 0.8, 1))
    page.insert_text((60, 250), "Figure 1", fontsize=10)
    
    doc.save(path)
    doc.close()
    print(f"Created sample PDF at {path}")

if __name__ == "__main__":
    sample_pdf = "sample_test.pdf"
    output_json = "sample_output.json"
    
    create_sample_pdf(sample_pdf)
    
    # Note: To run the actual extraction, we need DEEPINFRA_API_KEY
    print("\nTo test full extraction, run:")
    print(f"export DEEPINFRA_API_KEY='your_key'")
    print(f"python backend/scripts/ocr_processor.py {sample_pdf} {output_json}")
