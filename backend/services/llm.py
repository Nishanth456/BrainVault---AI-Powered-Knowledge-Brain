import os
from litellm import acompletion
from backend.config import settings

# Set API keys for LiteLLM
os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY
if settings.GEMINI_API_KEY:
    os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY
if settings.OPENROUTER_API_KEYS:
    # OPENROUTER_API_KEYS may be a comma-separated list; LiteLLM expects a single key
    os.environ["OPENROUTER_API_KEY"] = settings.OPENROUTER_API_KEYS.split(",")[0].strip()


async def detect_input_type(raw_input: str) -> str:
    """
    LLM Call #1 (the ONLY real LLM call in Phase 0).
    Returns: 'linkedin' | 'blog' | 'pdf' | 'research' | 'github' | 'youtube' | 'course' | 'plaintext'
    """
    raw_input_lower = raw_input.strip().lower()
    
    # Fast path for obvious URLs to save LLM calls and avoid rate limits/misclassifications
    if raw_input_lower.startswith("http://") or raw_input_lower.startswith("https://"):
        if "linkedin.com" in raw_input_lower:
            return "linkedin"
        if "github.com" in raw_input_lower:
            return "github"
        if "youtube.com" in raw_input_lower or "youtu.be" in raw_input_lower:
            return "youtube"
        if any(domain in raw_input_lower for domain in ["udemy.com", "coursera.org", "deeplearning.ai", "fast.ai"]):
            return "course"
        if any(domain in raw_input_lower for domain in ["medium.com", "dev.to", "hashnode.com", "substack.com"]):
            return "blog"
        if "arxiv.org" in raw_input_lower or "researchgate.net" in raw_input_lower:
            return "research"
        if raw_input_lower.split("?")[0].endswith(".pdf"):
            return "pdf"
        
        # If it's a URL but didn't match the above, let the LLM try to figure out if it's a blog/cert/etc

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
        response = await fast_llm(
            prompt=prompt,
            system="You are a classifier. Respond with ONLY the category name, nothing else.",
            max_tokens=10,
            temperature=0,
        )

        detected = response.strip().lower()
        valid_types = ["linkedin", "blog", "pdf", "research", "github", "youtube", "course", "certification", "plaintext"]
        return detected if detected in valid_types else "plaintext"

    except Exception as e:
        print(f"LLM detection failed, defaulting to plaintext: {e}")
        return "plaintext"


async def call_llm(
    prompt: str,
    model: str,
    system: str = "You are a helpful AI assistant.",
    temperature: float = 0.1,
    max_tokens: int = 1000,
    response_format: dict = None
) -> str:
    kwargs = {}
    if response_format:
        kwargs["response_format"] = response_format

    # Gemini models can infinite-loop with temperature < 1.0
    if "gemini" in model and temperature < 1.0:
        temperature = 1.0

    try:
        response = await acompletion(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            num_retries=3,
            **kwargs
        )
        raw_content = response.choices[0].message.content
        content = raw_content.strip() if raw_content else ""
        # Strip <think>...</think> blocks from reasoning models (like Qwen)
        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        return content
    except Exception as e:
        print(f"❌ Primary model ({model}) failed: {str(e)}")
        raise


async def stream_rag_response(system: str, prompt: str):
    """
    Stream a response token-by-token for RAG.
    Yields text chunks as they arrive.
    """
    models = ["gemini/gemini-3.6-flash"]
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
                delta = chunk.choices[0].delta.content if hasattr(chunk.choices[0].delta, 'content') else chunk.choices[0].get("delta", {}).get("content")
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
    model: str,
    max_tokens: int = 1500,
) -> dict:
    """
    Call an LLM and parse the response as JSON.
    Strips markdown fences (```json ... ```) if present.
    Returns {} on any failure so callers never hard-crash.
    """
    import re as _re
    import json as _json

    for attempt in range(4):
        try:
            raw = await call_llm(
                prompt=prompt,
                model=model,
                system="You are a helpful AI assistant. Always respond with valid JSON only. Do not add any commentary outside the JSON.",
                max_tokens=max_tokens,
                response_format={"type": "json_object"}
            )
            # Attempt to extract JSON block using regex if there's preamble text
            match = _re.search(r'(\{.*\}|\[.*\])', raw, _re.DOTALL)
            if match:
                raw = match.group(0)

            try:
                parsed = _json.loads(raw)
                return parsed
            except _json.JSONDecodeError:
                import ast
                parsed = ast.literal_eval(raw)
                if isinstance(parsed, (dict, list)):
                    return parsed
                raise ValueError("ast.literal_eval failed to return dict or list")
        except Exception as e:
            print(f"⚠️ call_llm_json attempt {attempt+1} parse/eval failed with {model}: {e}\nRaw output: {raw[:100]}...")
            
    # Fallback to gemini 3.6 flash if we exhausted attempts
    if model != "gemini/gemini-3.6-flash":
        print(f"⚠️ Exhausted attempts with {model}. Retrying with gemini/gemini-3.6-flash...")
        try:
            fallback_raw = await call_llm(
                prompt=prompt,
                model="gemini/gemini-3.6-flash",
                system="You are a helpful AI assistant. Always respond with valid JSON only. Do not add any commentary outside the JSON.",
                max_tokens=max_tokens,
                response_format={"type": "json_object"}
            )
            fallback_match = _re.search(r'(\{.*\}|\[.*\])', fallback_raw, _re.DOTALL)
            if fallback_match:
                fallback_raw = fallback_match.group(0)
            return _json.loads(fallback_raw)
        except Exception as fallback_e:
            print(f"⚠️ call_llm_json fallback failed: {fallback_e}")

    return {}

class LLMClient:
    """Wrapper to maintain standardized LLM models and provide a clean async interface."""
    def __init__(self, model_name: str):
        self.model = model_name

    async def __call__(self, prompt: str, system: str = "You are a helpful AI assistant.", temperature: float = 0.1, max_tokens: int = 1000, response_format: dict = None) -> str:
        return await call_llm(prompt, model=self.model, system=system, temperature=temperature, max_tokens=max_tokens, response_format=response_format)
    
    async def json(self, prompt: str, max_tokens: int = 1500) -> dict:
        return await call_llm_json(prompt, model=self.model, max_tokens=max_tokens)


# Single Source of Truth for Models
fast_llm = LLMClient("gemini/gemini-3.1-flash-lite")
reasoning_llm = LLMClient("gemini/gemini-3.6-flash")
