import os
from litellm import acompletion
from backend.config import settings

# Set API keys for LiteLLM
os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY
if settings.GEMINI_API_KEY:
    os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY


async def detect_input_type(raw_input: str) -> str:
    """
    LLM Call #1 (the ONLY real LLM call in Phase 0).
    Uses Groq llama-3.1-8b-instant — fast and free.
    Returns: 'linkedin' | 'blog' | 'pdf' | 'research' | 'github' | 'youtube' | 'course' | 'plaintext'
    """
    prompt = f"""Classify this input into exactly one of these categories:
linkedin, blog, pdf, research, github, youtube, course, certification, plaintext

Rules:
- linkedin: any linkedin.com URL
- blog: Medium, Dev.to, Hashnode, Substack, or any blog post URL
- pdf: a .pdf file path or PDF URL
- research: arxiv.org URL, ResearchGate, or any academic paper link
- github: github.com URL
- youtube: youtube.com or youtu.be URL
- course: Udemy, Coursera, fast.ai, DeepLearning.AI URL
- certification: certification exam page, practice test, or credential URL
- plaintext: everything else (pasted text, notes, code, conversations)

Input: {raw_input[:500]}

Respond with ONLY the category name, nothing else."""

    try:
        response = await acompletion(
            model="groq/llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10,
            temperature=0,
        )

        detected = response.choices[0].message.content.strip().lower()
        valid_types = ["linkedin", "blog", "pdf", "research", "github", "youtube", "course", "certification", "plaintext"]
        return detected if detected in valid_types else "plaintext"

    except Exception as e:
        print(f"LLM detection failed, defaulting to plaintext: {e}")
        return "plaintext"


async def call_llm(
    prompt: str,
    model: str = "groq/llama-3.3-70b-versatile",
    system: str = "You are a helpful AI assistant.",
    temperature: float = 0.1,
    max_tokens: int = 1000,
    fallback_model: str = "groq/llama-3.1-8b-instant"
) -> str:
    """
    Unified LLM call with automatic fallback.
    Default: Groq 70B → fallback: Groq 8B
    """
    try:
        response = await acompletion(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Primary model failed: {e}. Trying fallback: {fallback_model}")
        # Auto-fallback if rate limited or model unavailable
        response = await acompletion(
            model=fallback_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()


async def stream_rag_response(system: str, prompt: str):
    """
    Stream a Groq response token-by-token for RAG.
    Falls back to Gemini if Groq is unavailable.
    Yields text chunks as they arrive.
    """
    models = [
        "groq/llama-3.3-70b-versatile",
        "groq/llama-3.1-8b-instant",
        "groq/llama-3.3-70b-specdec",
        "gemini/gemini-2.0-flash",
    ]
    last_error = None
    for model in models:
        try:
            response = await acompletion(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=2000,
                stream=True,
            )
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
            return
        except Exception as e:
            last_error = e
            print(f"Streaming model {model} failed: {e}")
            continue

    print(f"All streaming models failed: {last_error}")
    yield "I'm sorry, I couldn't generate a response right now. Please try again."


async def call_llm_json(
    prompt: str,
    model: str = "groq/llama-3.3-70b-versatile",
    max_tokens: int = 1500,
) -> dict:
    """
    Call an LLM and parse the response as JSON.
    Strips markdown fences (```json ... ```) if present.
    Returns {} on any failure so callers never hard-crash.
    """
    import re as _re
    import json as _json

    raw = await call_llm(
        prompt=prompt,
        model=model,
        system="You are a helpful AI assistant. Always respond with valid JSON only. Do not add any commentary outside the JSON.",
        max_tokens=max_tokens,
    )
    # Strip ```json ... ``` or ``` ... ``` fences
    raw = raw.strip()
    raw = _re.sub(r"^```(?:json)?\s*", "", raw, flags=_re.MULTILINE)
    raw = _re.sub(r"\s*```\s*$", "", raw, flags=_re.MULTILINE)
    raw = raw.strip()
    try:
        return _json.loads(raw)
    except Exception as e:
        print(f"⚠️ call_llm_json parse failed: {e}\nRaw output (first 500 chars): {raw[:500]}")
        return {}

