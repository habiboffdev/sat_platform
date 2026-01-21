"""
OCR Service - Multi-provider OCR client with parallel processing.

Supports:
- OpenAI (gpt-4o-mini) - Reliable, good for OCR
- DeepInfra (olmOCR, Qwen, DeepSeek) - Cost-effective
- Hybrid - OpenAI OCR + DeepInfra structuring
- Replicate (dots.ocr) - Best for math/formulas
- OpenRouter (Qwen 2.5 VL, DeepSeek) - Best price/performance, multi-model access
"""

import asyncio
import base64
import hashlib
import json
import random
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings


@dataclass
class OCRResult:
    """Result from OCR extraction."""
    markdown: str
    is_question_page: bool
    cost_cents: float = 0.0
    tokens_used: int = 0


@dataclass
class TableData:
    """Structured table data."""
    headers: list[str]
    rows: list[list[str]]
    title: str | None = None


@dataclass
class StructuredPassage:
    """Structured passage extracted from OCR."""
    temp_id: str  # Temporary ID for linking (e.g., "p1", "p2")
    title: str | None
    content: str
    source: str | None
    author: str | None
    has_figure: bool
    word_count: int
    confidence: float


@dataclass
class StructuredQuestion:
    """Structured question extracted from OCR."""
    question_text: str
    question_type: str
    options: list[dict] | None
    correct_answer: list[str] | None
    explanation: str | None
    passage_text: str | None  # Legacy: inline passage (will migrate to passage_ref)
    passage_ref: str | None  # Reference to passage temp_id (e.g., "p1")
    chart_title: str | None
    chart_data: str | None  # Legacy HTML format
    table_data: dict | None  # New structured format
    needs_image: bool
    image_in: str | None  # "question", "passage", "option_A", etc.
    domain: str | None
    difficulty: str | None
    confidence: float


@dataclass
class StructuredResult:
    """Combined result of passage and question extraction."""
    passages: list[StructuredPassage]
    questions: list[StructuredQuestion]


class OCRClient:
    """Multi-provider OCR client with rate limiting and retries."""

    # Provider configurations
    PROVIDERS = {
        "deepinfra": {
            "url": "https://api.deepinfra.com/v1/openai/chat/completions",
            "models": {
                "vision": "allenai/olmOCR-2-7B-1025",  # OCR extraction
                "llm": "deepseek-ai/DeepSeek-V3.1",    # JSON structuring
            },
        },
        "openai": {
            "url": "https://api.openai.com/v1/chat/completions",
            "models": {
                "vision": "gpt-4o-mini",  # OCR extraction
                "llm": "gpt-4o-mini",     # JSON structuring
            },
        },
        "openrouter": {
            "url": "https://openrouter.ai/api/v1/chat/completions",
            "models": {
                "vision": "qwen/qwen2.5-vl-32b-instruct",  # OCR extraction (cheap, good accuracy)
                "llm": "deepseek/deepseek-v3.2",           # JSON structuring (supports structured output)
            },
        },
    }

    # Cost per 1000 tokens (USD cents)
    COSTS = {
        "gpt-4o-mini": {"input": 0.015, "output": 0.060},
        "allenai/olmOCR-2-7B-1025": {"input": 0.005, "output": 0.005},
        "Qwen/Qwen2.5-VL-32B-Instruct": {"input": 0.012, "output": 0.012},
        "deepseek-ai/DeepSeek-V3.1": {"input": 0.001, "output": 0.002},
        # OpenRouter models (prices from OpenRouter - per 1M tokens, converted to cents per 1K)
        "qwen/qwen2.5-vl-32b-instruct": {"input": 0.005, "output": 0.022},
        "qwen/qwen2.5-vl-72b-instruct": {"input": 0.040, "output": 0.040},
        "deepseek/deepseek-v3.2": {"input": 0.025, "output": 0.038},  # $0.25/$0.38 per 1M tokens
    }

    def __init__(self):
        self._semaphore = asyncio.Semaphore(settings.ocr_max_concurrent_pages)

    def _get_api_key(self, provider: str) -> str:
        """Get API key for provider."""
        if provider == "openai":
            if not settings.openai_api_key:
                raise ValueError("OPENAI_API_KEY not configured")
            return settings.openai_api_key
        elif provider == "deepinfra":
            if not settings.deepinfra_api_key:
                raise ValueError("DEEPINFRA_API_KEY not configured")
            return settings.deepinfra_api_key
        elif provider == "replicate":
            if not settings.replicate_api_key:
                raise ValueError("REPLICATE_API_KEY not configured")
            return settings.replicate_api_key
        elif provider == "openrouter":
            if not settings.openrouter_api_key:
                raise ValueError("OPENROUTER_API_KEY not configured")
            return settings.openrouter_api_key
        raise ValueError(f"Unknown provider: {provider}")

    def _estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost in cents."""
        costs = self.COSTS.get(model, {"input": 0.01, "output": 0.01})
        return (input_tokens * costs["input"] / 1000) + (output_tokens * costs["output"] / 1000)

    async def _call_api(
        self,
        provider: str,
        model: str,
        messages: list[dict],
        response_format: dict | None = None,
        timeout: int | None = None,
    ) -> dict:
        """Make API call with retries and rate limiting."""
        async with self._semaphore:
            config = self.PROVIDERS.get(provider, self.PROVIDERS["openai"])
            api_key = self._get_api_key(provider)
            url = config["url"]

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            # OpenRouter requires additional headers for identification
            if provider == "openrouter":
                headers["HTTP-Referer"] = "https://sat-platform.app"
                headers["X-Title"] = "SAT Platform OCR"

            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": 4096,
            }
            # OpenAI and OpenRouter (with compatible models like DeepSeek V3.2) support response_format
            if response_format and provider in ("openai", "openrouter"):
                payload["response_format"] = response_format

            timeout_val = timeout or settings.ocr_api_timeout

            max_retries = settings.ocr_max_retries
            # Use more retries for rate limits specifically
            rate_limit_retries = max_retries * 2

            for attempt in range(rate_limit_retries):
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.post(
                            url,
                            headers=headers,
                            json=payload,
                            timeout=float(timeout_val),
                        )
                        response.raise_for_status()
                        return response.json()
                except httpx.TimeoutException:
                    if attempt < max_retries - 1:
                        delay = settings.ocr_retry_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    raise
                except httpx.HTTPStatusError as e:
                    status_code = e.response.status_code

                    # Handle 429 Rate Limit with longer backoff + jitter
                    if status_code == 429:
                        if attempt < rate_limit_retries - 1:
                            # Parse Retry-After header if present, else use exponential backoff
                            retry_after = e.response.headers.get("Retry-After")
                            if retry_after and retry_after.isdigit():
                                base_delay = int(retry_after) + 1
                            else:
                                # Longer backoff for rate limits: 5, 10, 20, 40 seconds...
                                base_delay = 5 * (2 ** min(attempt, 4))  # Cap at 80s
                            # Add random jitter (0-50% of base delay) to prevent thundering herd
                            jitter = random.uniform(0, base_delay * 0.5)
                            delay = base_delay + jitter
                            await asyncio.sleep(delay)
                            continue
                        raise

                    # Handle 5xx server errors
                    if status_code >= 500 and attempt < max_retries - 1:
                        delay = settings.ocr_retry_delay * (2 ** attempt)
                        await asyncio.sleep(delay)
                        continue
                    raise

    async def extract_text(
        self,
        image_base64: str,
        provider: str = "openai",
    ) -> OCRResult:
        """
        Extract text from image using OCR.

        Args:
            image_base64: Base64 encoded image
            provider: API provider (openai, deepinfra)

        Returns:
            OCRResult with markdown text
        """
        config = self.PROVIDERS.get(provider, self.PROVIDERS["openai"])
        model = config["models"]["vision"]

        system_prompt = """SAT exam OCR extractor. Output clean Markdown.
Rules:
1) Extract ALL text including question numbers and options A-D
2) CRITICAL - Math formatting: ALWAYS wrap ALL mathematical expressions in LaTeX delimiters:
   - Use $...$ for inline math (equations, variables, functions like $f(x) = 2x + 1$, $x^2$, $\\frac{1}{2}$)
   - Use $$...$$ for display/block math (standalone equations)
   - This includes: variables (x, y), functions f(x), equations, fractions, exponents, etc.
3) Tables: output as HTML <table> tags
4) Graphs/Charts: describe briefly, note "needs_image: true" if visual is required
5) Ignore watermarks and page numbers"""

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all text from this SAT page:"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                ],
            },
        ]

        result = await self._call_api(provider, model, messages)
        content = result["choices"][0]["message"]["content"]

        # Estimate cost
        usage = result.get("usage", {})
        cost = self._estimate_cost(
            model,
            usage.get("prompt_tokens", 500),
            usage.get("completion_tokens", 500),
        )

        # Check if this is a question page
        is_question = self._is_question_page(content)

        return OCRResult(
            markdown=content,
            is_question_page=is_question,
            cost_cents=cost,
            tokens_used=usage.get("total_tokens", 1000),
        )

    def _is_question_page(self, markdown_text: str) -> bool:
        """
        Check if OCR output contains SAT question patterns.
        Filters out ads, blank pages, and answer keys.
        """
        text = markdown_text.lower()

        # Minimum text length
        if len(text.strip()) < 50:
            return False

        # Question indicators
        question_patterns = [
            r"mark\s+for\s+review",
            r"question\s+\d+",
            r"\b(a\)|b\)|c\)|d\))",
            r"\b(a\.|b\.|c\.|d\.)",
            r"\bwhat is\b",
            r"\bwhich of\b",
            r"\bif\s+.+\s*=",
            r"\bsolve\b",
            r"\bthe value of\b",
            r"\bequation\b",
            r"\bgraph\b",
            r"\bfunction\b",
            r"\$.*\$",
            r"\\frac\{",
            r"\\sqrt\{",
        ]

        # Non-question indicators
        non_question_patterns = [
            r"^answer\s*key",
            r"advertisement",
            r"^instructions?:?\s*$",
        ]

        # Check non-question patterns first
        for pattern in non_question_patterns:
            if re.search(pattern, text):
                return False

        # Check question patterns
        for pattern in question_patterns:
            if re.search(pattern, text):
                return True

        # Default: substantial text is likely a question
        return len(text.strip()) > 150

    async def structure_to_json(
        self,
        markdown_text: str,
        graph_files: list[str] | None = None,
        provider: str = "deepinfra",
    ) -> list[StructuredQuestion]:
        """
        Convert OCR markdown to structured questions.

        Args:
            markdown_text: OCR extracted text
            graph_files: List of detected graph filenames
            provider: API provider for LLM

        Returns:
            List of structured questions
        """
        config = self.PROVIDERS.get(provider, self.PROVIDERS["deepinfra"])
        model = config["models"]["llm"]

        system_prompt = """SAT question extractor. Return JSON with SEPARATE passages and questions.

OUTPUT FORMAT:
{
  "passages": [
    {
      "temp_id": "p1",
      "title": "Passage title or null",
      "content": "Full passage text...",
      "source": "Publication name or null",
      "author": "Author name or null",
      "has_figure": false,
      "word_count": 150,
      "confidence": 0.95
    }
  ],
  "questions": [
    {
      "passage_ref": "p1" | null,
      "question_text": "Question stem only",
      "question_type": "multiple_choice" | "student_produced_response",
      "table_data": {"headers": [...], "rows": [...], "title": "..."} | null,
      "needs_image": true | false,
      "image_in": "question" | "passage" | "option_A" | "option_B" | "option_C" | "option_D" | null,
      "options": [{"id": "A", "text": "...", "has_image": false}] | null,
      "correct_answer": ["C"] | ["1/2", "0.5", ".5"],
      "explanation": "Why this answer is correct",
      "domain": "algebra" | "advanced_math" | "geometry_trigonometry" | "problem_solving_data_analysis" | "craft_and_structure" | "information_and_ideas" | "expression_of_ideas" | "standard_english_conventions",
      "difficulty": "easy" | "medium" | "hard",
      "confidence": 0.95
    }
  ]
}

DIGITAL SAT RULES:
1. **CRITICAL - MATH FORMATTING**: ALL math MUST use LaTeX $...$ delimiters!
   - Wrap ALL variables, equations, expressions in $...$
   - Examples: $x$, $8^2 + b^2 = 20^2$, $f(x) = 2x + 1$, $\\frac{1}{2}$
   - Convert \\(...\\) to $...$ and \\[...\\] to $$...$$
   - Options with math: {"id": "A", "text": "$8^2 + b^2 = 20^2$"}
2. EBRW: Extract passage SEPARATELY into "passages" array, question references via passage_ref
3. Math: No passage needed, question_text contains full context
4. Tables: Convert to structured JSON format (NOT HTML)
5. SPR (grid-in): options=null, correct_answer has ALL valid formats (e.g., ["1/2", "0.5", ".5"])
6. Images: Set needs_image=true if visual is required, image_in specifies where
7. Domain: Use exact enum values (lowercase with underscores)
8. ALWAYS try to determine correct_answer. Only use ["[NEED_ANSWER]"] if truly impossible.

Return valid JSON only."""

        graph_list = ", ".join([Path(f).name for f in (graph_files or [])]) or "none"
        user_content = f"Images: {graph_list}\n\nOCR TEXT:\n{markdown_text}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        result = await self._call_api(
            provider,
            model,
            messages,
            response_format={"type": "json_object"},
            timeout=settings.ocr_structuring_timeout,
        )

        content = result["choices"][0]["message"]["content"]
        data = json.loads(content)

        # Build passage lookup map for linking
        passage_map: dict[str, dict] = {}
        for p in data.get("passages", []):
            temp_id = p.get("temp_id", "")
            if temp_id:
                passage_map[temp_id] = p

        questions = []
        raw_questions = data.get("questions", [data] if isinstance(data, dict) else data)

        for q in raw_questions:
            # Determine if answer needs manual input
            answer = q.get("correct_answer", [])
            needs_answer = (
                not answer
                or (isinstance(answer, list) and "[NEED_ANSWER]" in answer)
            )

            # Map domain string to enum value
            domain = self._map_domain(q.get("domain", ""))

            # Parse table_data - can be dict from LLM or HTML string to convert
            table_data = self._parse_table_data(q.get("table_data"), q.get("chart_data"))

            # Get passage_ref and resolve to passage_text for backward compatibility
            passage_ref = q.get("passage_ref")
            passage_text = q.get("passage_text")  # Legacy field

            # If we have a passage_ref, get the passage content
            if passage_ref and passage_ref in passage_map:
                passage_text = passage_map[passage_ref].get("content")

            questions.append(
                StructuredQuestion(
                    question_text=q.get("question_text", ""),
                    question_type=self._map_question_type(q.get("question_type", "multiple_choice")),
                    options=self._parse_options(q.get("options")),
                    correct_answer=answer if not needs_answer else None,
                    explanation=q.get("explanation"),
                    passage_text=passage_text,
                    passage_ref=passage_ref,
                    chart_title=q.get("chart_title"),
                    chart_data=q.get("chart_data"),  # Keep legacy for backward compat
                    table_data=table_data,
                    needs_image=q.get("needs_image", False),
                    image_in=q.get("image_in"),
                    domain=domain,
                    difficulty=self._map_difficulty(q.get("difficulty", "Medium")),
                    confidence=float(q.get("confidence", 0.8)),
                )
            )

        return questions

    async def structure_to_json_with_passages(
        self,
        markdown_text: str,
        graph_files: list[str] | None = None,
        provider: str = "deepinfra",
    ) -> StructuredResult:
        """
        Convert OCR markdown to structured passages and questions.

        This enhanced version extracts passages separately from questions,
        allowing proper linking and deduplication.

        Returns:
            StructuredResult with separate passages and questions
        """
        # Use the same extraction logic as structure_to_json but return full result
        config = self.PROVIDERS.get(provider, self.PROVIDERS["deepinfra"])
        model = config["models"]["llm"]

        system_prompt = """SAT question extractor. Return JSON with SEPARATE passages and questions.

OUTPUT FORMAT:
{
  "passages": [
    {
      "temp_id": "p1",
      "title": "Passage title or null",
      "content": "Full passage text...",
      "source": "Publication name or null",
      "author": "Author name or null",
      "has_figure": false,
      "word_count": 150,
      "confidence": 0.95
    }
  ],
  "questions": [
    {
      "passage_ref": "p1" | null,
      "question_text": "Question stem only",
      "question_type": "multiple_choice" | "student_produced_response",
      "table_data": {"headers": [...], "rows": [...], "title": "..."} | null,
      "needs_image": true | false,
      "image_in": "question" | "passage" | "option_A" | "option_B" | "option_C" | "option_D" | null,
      "options": [{"id": "A", "text": "...", "has_image": false}] | null,
      "correct_answer": ["C"] | ["1/2", "0.5", ".5"],
      "explanation": "Why this answer is correct",
      "domain": "algebra" | "advanced_math" | "geometry_trigonometry" | "problem_solving_data_analysis" | "craft_and_structure" | "information_and_ideas" | "expression_of_ideas" | "standard_english_conventions",
      "difficulty": "easy" | "medium" | "hard",
      "confidence": 0.95
    }
  ]
}

DIGITAL SAT RULES:
1. **CRITICAL - MATH FORMATTING**: ALL math MUST use LaTeX $...$ delimiters!
   - Wrap ALL variables, equations, expressions in $...$
   - Examples: $x$, $8^2 + b^2 = 20^2$, $f(x) = 2x + 1$, $\\frac{1}{2}$
   - Convert \\(...\\) to $...$ and \\[...\\] to $$...$$
   - Options with math: {"id": "A", "text": "$8^2 + b^2 = 20^2$"}
2. EBRW: Extract passage SEPARATELY into "passages" array, question references via passage_ref
3. Math: No passage needed, passage_ref should be null
4. Tables: Convert to structured JSON format (NOT HTML)
5. SPR (grid-in): options=null, correct_answer has ALL valid formats
6. Images: Set needs_image=true if visual is required, image_in specifies where
7. Domain: Use exact enum values (lowercase with underscores)
8. ALWAYS try to determine correct_answer. Only use ["[NEED_ANSWER]"] if truly impossible.

Return valid JSON only."""

        graph_list = ", ".join([Path(f).name for f in (graph_files or [])]) or "none"
        user_content = f"Images: {graph_list}\n\nOCR TEXT:\n{markdown_text}"

        result = await self._call_api(
            provider,
            model,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            timeout=settings.ocr_structuring_timeout,
        )

        content = result["choices"][0]["message"]["content"]
        data = json.loads(content)

        # Parse passages
        passages = []
        passage_map: dict[str, StructuredPassage] = {}

        for p in data.get("passages", []):
            temp_id = p.get("temp_id", f"p{len(passages)+1}")
            passage = StructuredPassage(
                temp_id=temp_id,
                title=p.get("title"),
                content=p.get("content", ""),
                source=p.get("source"),
                author=p.get("author"),
                has_figure=p.get("has_figure", False),
                word_count=p.get("word_count", len(p.get("content", "").split())),
                confidence=float(p.get("confidence", 0.8)),
            )
            passages.append(passage)
            passage_map[temp_id] = passage

        # Parse questions
        questions = []
        for q in data.get("questions", []):
            answer = q.get("correct_answer", [])
            needs_answer = (
                not answer
                or (isinstance(answer, list) and "[NEED_ANSWER]" in answer)
            )
            domain = self._map_domain(q.get("domain", ""))
            table_data = self._parse_table_data(q.get("table_data"), q.get("chart_data"))

            passage_ref = q.get("passage_ref")
            passage_text = q.get("passage_text")
            if passage_ref and passage_ref in passage_map:
                passage_text = passage_map[passage_ref].content

            questions.append(
                StructuredQuestion(
                    question_text=q.get("question_text", ""),
                    question_type=self._map_question_type(q.get("question_type", "multiple_choice")),
                    options=self._parse_options(q.get("options")),
                    correct_answer=answer if not needs_answer else None,
                    explanation=q.get("explanation"),
                    passage_text=passage_text,
                    passage_ref=passage_ref,
                    chart_title=q.get("chart_title"),
                    chart_data=q.get("chart_data"),
                    table_data=table_data,
                    needs_image=q.get("needs_image", False),
                    image_in=q.get("image_in"),
                    domain=domain,
                    difficulty=self._map_difficulty(q.get("difficulty", "Medium")),
                    confidence=float(q.get("confidence", 0.8)),
                )
            )

        return StructuredResult(passages=passages, questions=questions)

    def _map_question_type(self, type_str: str) -> str:
        """Map raw question type to enum value."""
        type_lower = type_str.lower()
        if "student" in type_lower or "produced" in type_lower or "grid" in type_lower:
            return "student_produced_response"
        return "multiple_choice"

    def _map_domain(self, domain_str: str | None) -> str | None:
        """Map domain string to enum value."""
        if not domain_str:
            return None

        domain_lower = domain_str.lower()
        mapping = {
            "algebra": "algebra",
            "advanced math": "advanced_math",
            "geometry": "geometry_trigonometry",
            "trigonometry": "geometry_trigonometry",
            "problem solving": "problem_solving_data_analysis",
            "data analysis": "problem_solving_data_analysis",
            "craft": "craft_and_structure",
            "structure": "craft_and_structure",
            "information": "information_and_ideas",
            "ideas": "information_and_ideas",
            "expression": "expression_of_ideas",
            "convention": "standard_english_conventions",
            "english": "standard_english_conventions",
        }

        for key, value in mapping.items():
            if key in domain_lower:
                return value

        return None

    def _map_difficulty(self, diff_str: str | None) -> str | None:
        """Map difficulty string to enum value."""
        if not diff_str:
            return "medium"

        diff_lower = diff_str.lower()
        if "easy" in diff_lower:
            return "easy"
        elif "hard" in diff_lower:
            return "hard"
        return "medium"

    def _parse_options(self, options: Any) -> list[dict] | None:
        """Parse options into standardized format."""
        if not options:
            return None

        parsed = []
        if isinstance(options, list):
            for i, opt in enumerate(options):
                opt_id = chr(65 + i)  # A, B, C, D
                if isinstance(opt, dict):
                    parsed.append({
                        "id": opt.get("id", opt_id),
                        "text": opt.get("text", str(opt)),
                        "image_url": opt.get("image_url"),
                    })
                elif isinstance(opt, str):
                    # Parse "A. text" format
                    text = opt
                    if len(opt) > 2 and opt[1] in ".)" and opt[0].upper() in "ABCD":
                        text = opt[2:].strip()
                        opt_id = opt[0].upper()
                    parsed.append({"id": opt_id, "text": text, "image_url": None})

        return parsed if parsed else None

    def _parse_table_data(self, table_data: Any, chart_data: str | None) -> dict | None:
        """
        Parse table data from LLM response or convert legacy HTML.

        Args:
            table_data: Structured table data from LLM (dict) or None
            chart_data: Legacy HTML table string

        Returns:
            Structured table dict or None
        """
        # If LLM provided structured table_data, validate and return it
        if isinstance(table_data, dict):
            if "headers" in table_data and "rows" in table_data:
                return {
                    "headers": table_data.get("headers", []),
                    "rows": table_data.get("rows", []),
                    "title": table_data.get("title"),
                }

        # Try to convert legacy HTML chart_data to structured format
        if chart_data and isinstance(chart_data, str) and "<table" in chart_data.lower():
            return self._html_table_to_json(chart_data)

        return None

    def _html_table_to_json(self, html: str) -> dict | None:
        """
        Convert HTML table to structured JSON format.

        Args:
            html: HTML string containing a table

        Returns:
            Structured table dict or None
        """
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')
            table = soup.find('table')
            if not table:
                return None

            # Extract headers from <th> elements
            headers = []
            header_row = table.find('tr')
            if header_row:
                th_elements = header_row.find_all('th')
                if th_elements:
                    headers = [th.get_text(strip=True) for th in th_elements]
                else:
                    # Fallback: use first row's <td> as headers
                    td_elements = header_row.find_all('td')
                    headers = [td.get_text(strip=True) for td in td_elements]

            # Extract data rows
            rows = []
            all_rows = table.find_all('tr')
            # Skip header row if we extracted headers from it
            start_idx = 1 if headers else 0

            for tr in all_rows[start_idx:]:
                cells = tr.find_all(['td', 'th'])
                if cells:
                    row = [cell.get_text(strip=True) for cell in cells]
                    # Only add non-empty rows
                    if any(cell.strip() for cell in row):
                        rows.append(row)

            if not headers and not rows:
                return None

            return {
                "headers": headers,
                "rows": rows,
                "title": None,
            }
        except ImportError:
            # BeautifulSoup not available - return None
            return None
        except Exception:
            return None

    async def process_page_batch(
        self,
        pages: list[tuple[int, str]],  # [(page_num, image_base64), ...]
        ocr_provider: str = "openai",
        structuring_provider: str = "deepinfra",
    ) -> list[dict]:
        """
        Process a batch of pages in parallel.

        Args:
            pages: List of (page_number, base64_image) tuples
            ocr_provider: Provider for OCR
            structuring_provider: Provider for JSON structuring

        Returns:
            List of page results
        """
        async def process_single_page(page_num: int, image_b64: str) -> dict:
            """Process a single page."""
            result = {
                "page_number": page_num,
                "ocr_markdown": "",
                "is_question_page": False,
                "questions": [],
                "figures": [],
                "ocr_cost_cents": 0,
                "structuring_cost_cents": 0,
                "error": None,
            }

            try:
                # 1. OCR extraction
                ocr_result = await self.extract_text(image_b64, provider=ocr_provider)
                result["ocr_markdown"] = ocr_result.markdown
                result["is_question_page"] = ocr_result.is_question_page
                result["ocr_cost_cents"] = ocr_result.cost_cents

                # 2. Skip if not a question page
                if not ocr_result.is_question_page:
                    return result

                # 3. Structure into JSON
                questions = await self.structure_to_json(
                    ocr_result.markdown,
                    provider=structuring_provider,
                )
                result["questions"] = [
                    {
                        "question_text": q.question_text,
                        "question_type": q.question_type,
                        "options": q.options,
                        "correct_answer": q.correct_answer,
                        "explanation": q.explanation,
                        "passage_text": q.passage_text,
                        "chart_title": q.chart_title,
                        "chart_data": q.chart_data,
                        "table_data": q.table_data,
                        "needs_image": q.needs_image,
                        "image_in": q.image_in,
                        "domain": q.domain,
                        "difficulty": q.difficulty,
                        "confidence": q.confidence,
                    }
                    for q in questions
                ]

            except Exception as e:
                result["error"] = str(e)

            return result

        # Process pages sequentially to avoid rate limits
        # (parallel processing with semaphore causes thundering herd)
        processed_results = []
        for num, img in pages:
            try:
                result = await process_single_page(num, img)
                processed_results.append(result)
            except Exception as e:
                processed_results.append({
                    "page_number": num,
                    "error": str(e),
                })
            # Small delay between pages to avoid rate limits
            await asyncio.sleep(0.5)

        return processed_results


# Singleton instance
ocr_client = OCRClient()


def get_pdf_hash(pdf_path: str) -> str:
    """Generate MD5 hash of PDF file."""
    hasher = hashlib.md5()
    with open(pdf_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def image_to_base64(image_path: str) -> str:
    """Convert image file to base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")
