"""
arxiv_client.py — Fetch metadata and PDF from arXiv URLs.

Supports:
- https://arxiv.org/abs/2305.10601
- https://arxiv.org/pdf/2305.10601.pdf
"""
import httpx
import re
from urllib.parse import urlparse


ARXIV_ID_RE = re.compile(r"(\d{4}\.\d{4,5})(?:v\d+)?")


def _extract_arxiv_id(url: str) -> str | None:
    path = urlparse(url).path
    match = ARXIV_ID_RE.search(path)
    return match.group(1) if match else None


def _is_arxiv(url: str) -> bool:
    return "arxiv.org" in urlparse(url).netloc.lower()


async def fetch_arxiv_metadata(arxiv_id: str) -> dict:
    """Fetch arXiv metadata via the export API (no key required)."""
    url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        xml = resp.text

    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError("No arXiv entry found")

    title = entry.findtext("atom:title", "", ns).strip().replace("\n", " ")
    summary = entry.findtext("atom:summary", "", ns).strip()
    published = entry.findtext("atom:published", "", ns)[:10]

    authors = []
    for author in entry.findall("atom:author", ns):
        name = author.findtext("atom:name", "", ns)
        if name:
            authors.append(name)

    category = ""
    cat_el = entry.find("atom:category", ns)
    if cat_el is not None:
        category = cat_el.get("term", "")

    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

    return {
        "arxiv_id": arxiv_id,
        "title": title,
        "authors": authors,
        "published": published,
        "summary": summary,
        "primary_category": category,
        "pdf_url": pdf_url,
        "source_url": f"https://arxiv.org/abs/{arxiv_id}",
    }


async def download_arxiv_pdf(arxiv_id: str, output_path: str) -> None:
    """Download the PDF to a local path."""
    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(pdf_url)
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            f.write(resp.content)


async def resolve_research_source(url: str) -> dict:
    """
    Resolve a research URL into metadata + a downloadable PDF URL.
    Returns: {
        "source_type": "arxiv" | "pdf_url" | "upload",
        "title": str | None,
        "authors": list[str],
        "published": str | None,
        "abstract": str | None,
        "primary_category": str,
        "pdf_url": str,
        "source_url": str,
        "arxiv_id": str | None,
    }
    """
    if _is_arxiv(url):
        arxiv_id = _extract_arxiv_id(url)
        if not arxiv_id:
            raise ValueError("Could not extract arXiv ID from URL")
        meta = await fetch_arxiv_metadata(arxiv_id)
        return {
            "source_type": "arxiv",
            "title": meta["title"],
            "authors": meta["authors"],
            "published": meta["published"],
            "abstract": meta["summary"],
            "primary_category": meta["primary_category"],
            "pdf_url": meta["pdf_url"],
            "source_url": meta["source_url"],
            "arxiv_id": arxiv_id,
        }

    if url.lower().endswith(".pdf"):
        return {
            "source_type": "pdf_url",
            "title": None,
            "authors": [],
            "published": None,
            "abstract": None,
            "primary_category": "",
            "pdf_url": url,
            "source_url": url,
            "arxiv_id": None,
        }

    # Generic research URLs (ResearchGate, ACL, OpenReview, etc.): try to fetch metadata
    return await _resolve_generic_research_url(url)


async def _resolve_generic_research_url(url: str) -> dict:
    """
    Fetch a generic research landing page and extract title + abstract.
    Falls back to a stub if the page cannot be parsed.
    """
    import httpx
    from bs4 import BeautifulSoup

    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )

    html = ""
    try:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except Exception:
        html = ""

    # Try Playwright fallback if httpx is blocked or returns tiny payload
    if len(html) < 2000 or "challenges.cloudflare.com" in html or "cf-mitigated" in html:
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                context = await browser.new_context(
                    user_agent=USER_AGENT,
                    viewport={"width": 1280, "height": 800},
                    extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                )
                page = await context.new_page()
                try:
                    await page.goto(url, wait_until="networkidle", timeout=45000)
                    await page.wait_for_timeout(3000)
                    html = await page.content()
                finally:
                    await page.close()
                    await browser.close()
        except Exception:
            pass

    title = None
    abstract = None
    if html:
        soup = BeautifulSoup(html, "lxml")

        # Title: prefer h1, then og:title, then <title>
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
        if not title:
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                title = og_title["content"].strip()
        if not title and soup.title:
            title = soup.title.get_text(strip=True)

        # Abstract: prefer meta description, then og:description, then first long paragraph
        for selector in ["meta[name='description']", "meta[property='og:description']", "meta[name='abstract']"]:
            tag = soup.select_one(selector)
            if tag and tag.get("content"):
                abstract = tag["content"].strip()
                break
        if not abstract:
            for p in soup.find_all("p"):
                text = p.get_text(strip=True)
                if 100 <= len(text) <= 2000:
                    abstract = text
                    break

    # Clean up ResearchGate title suffixes
    if title:
        title = re.sub(r"\s*[-|]\s*ResearchGate\s*$", "", title, flags=re.IGNORECASE).strip()

    return {
        "source_type": "generic_research_url",
        "title": title,
        "authors": [],
        "published": None,
        "abstract": abstract,
        "primary_category": "",
        "pdf_url": None,
        "source_url": url,
        "arxiv_id": None,
    }
