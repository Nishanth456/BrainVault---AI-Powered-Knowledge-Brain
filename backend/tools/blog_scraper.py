"""
blog_scraper.py — Fetch and extract content from blog URLs.

Supports:
- Medium (medium.com, *.medium.com) via Playwright to bypass Cloudflare
- Dev.to
- Hashnode
- Substack
- Generic blogs with article markup
"""
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _site_name(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "medium.com" in host or host.endswith(".medium.com"):
        return "Medium"
    if "dev.to" in host:
        return "Dev.to"
    if "hashnode" in host:
        return "Hashnode"
    if "substack.com" in host:
        return "Substack"
    return "Blog"


def _is_medium(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return "medium.com" in host or host.endswith(".medium.com")


async def _fetch_with_playwright(url: str) -> str:
    """Use Playwright to fetch the page HTML (for sites that block httpx)."""
    from playwright.async_api import async_playwright

    html = ""
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
    return html


async def fetch_blog(url: str) -> dict:
    """
    Fetch a blog page and extract clean article text + metadata.
    Returns: {
        "url": str,
        "site": str,
        "title": str | None,
        "author": str | None,
        "published_date": str | None,
        "raw_html": str,
        "article_text": str,
        "error": str | None,
    }
    """
    html = ""
    try:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

        # If we got a Cloudflare challenge or tiny payload, fall back to Playwright
        if len(html) < 2000 or "challenges.cloudflare.com" in html or "cf-mitigated" in html:
            raise ValueError("Cloudflare challenge detected")
    except Exception as e:
        # Fallback to Playwright for Medium and other protected sites
        try:
            html = await _fetch_with_playwright(url)
        except Exception as pw_err:
            return {
                "url": url,
                "site": _site_name(url),
                "title": None,
                "author": None,
                "published_date": None,
                "raw_html": "",
                "article_text": "",
                "error": f"Failed to fetch blog: {pw_err}",
            }

    soup = BeautifulSoup(html, "lxml")

    # Title: prefer article heading, then og:title, then <title>
    title = None
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
    if not title and soup.title:
        title = soup.title.get_text(strip=True)

    # Author
    author = None
    for selector in [
        "meta[name='author']",
        "meta[property='article:author']",
        "meta[name='twitter:creator']",
    ]:
        tag = soup.select_one(selector)
        if tag and tag.get("content"):
            author = tag["content"].strip()
            break
    # Fallback: common author class names
    if not author:
        for cls in ["author", "byline", "post-author", "article-author", "pw-author-name"]:
            el = soup.find(class_=cls)
            if el:
                author = el.get_text(strip=True)
                break

    # Published date
    published_date = None
    for selector in ["meta[property='article:published_time']", "meta[name='datePublished']"]:
        tag = soup.select_one(selector)
        if tag and tag.get("content"):
            published_date = tag["content"].strip()
            break

    # Article text extraction
    article_text = ""

    # Try common article containers first
    article = soup.find("article")
    if article:
        article_text = article.get_text(separator="\n", strip=True)
    else:
        # Medium-specific
        medium_root = soup.find("div", class_=lambda c: c and "article-content" in c)
        if medium_root:
            article_text = medium_root.get_text(separator="\n", strip=True)
        else:
            # Generic fallback: largest <div> with paragraphs
            candidates = []
            for div in soup.find_all("div"):
                text = div.get_text(separator=" ", strip=True)
                p_count = len(div.find_all("p"))
                if len(text) > 500 and p_count >= 3:
                    candidates.append((len(text), p_count, text, div))
            if candidates:
                candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                article_text = candidates[0][2]

    # Clean up excessive whitespace
    article_text = "\n".join(line.strip() for line in article_text.splitlines() if line.strip())

    return {
        "url": url,
        "site": _site_name(url),
        "title": title,
        "author": author,
        "published_date": published_date,
        "raw_html": html,
        "article_text": article_text,
        "error": None,
    }
