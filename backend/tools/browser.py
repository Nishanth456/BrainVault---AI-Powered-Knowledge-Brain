"""
browser.py — Authenticated LinkedIn scraper using Playwright.

Flow:
1. Login to LinkedIn with stored credentials (first run only — cookies are saved)
2. On subsequent runs, restore the saved cookies (no re-login needed)
3. Navigate to the post URL
4. Extract: post text, author, date, PDF download URL or carousel slide images
5. Download the PDF/images for storage in MinIO
"""
import asyncio
import json
import os
import httpx
from pathlib import Path
from playwright.async_api import async_playwright, Page, BrowserContext
from bs4 import BeautifulSoup
from backend.config import settings

# ── Cookie persistence ────────────────────────────────────────────────────────
# Store cookies next to this file so they survive restarts
_COOKIE_FILE = Path(__file__).parent.parent / "linkedin_session.json"


class LinkedInScraper:
    """
    Authenticated LinkedIn scraper.
    Logs in once, saves session cookies, reuses them for all subsequent requests.
    """

    async def _get_authenticated_context(self, playwright) -> BrowserContext:
        """Launch browser and return a context with a valid LinkedIn session."""
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ]
        )

        # Create context, using the saved session file if it exists
        context_args = {
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "viewport": {"width": 1280, "height": 800},
            "extra_http_headers": {"Accept-Language": "en-US,en;q=0.9"},
        }
        
        if _COOKIE_FILE.exists():
            print("🍪 LinkedIn session restored from storage state file")
            context_args["storage_state"] = str(_COOKIE_FILE)
            
        context = await browser.new_context(**context_args)

        if _COOKIE_FILE.exists():
            # Session is loaded natively via context creation, skip headless login
            return context, browser

        # No saved session — need to log in
        await self._login(context)
        return context, browser

    async def _login(self, context: BrowserContext) -> None:
        """Log in to LinkedIn and save session cookies."""
        email = settings.LINKEDIN_EMAIL
        password = settings.LINKEDIN_PASSWORD

        if not email or not password or email == "your_email@example.com":
            print("⚠️ LinkedIn credentials not configured in backend/.env")
            return

        print("🔐 Logging in to LinkedIn...")
        page = await context.new_page()

        try:
            await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)

            # Fill in credentials
            await page.locator("input[type='email'], input#session_key, input#username").first.fill(email, force=True)
            await page.wait_for_timeout(500)
            await page.locator("input[type='password'], input#session_password, input#password").first.fill(password, force=True)
            await page.wait_for_timeout(500)

            # Submit login form
            await page.keyboard.press("Enter")
            
            # Wait for login to complete by checking for a known post-login element or URL
            try:
                await page.wait_for_url("**/feed/**", timeout=15000)
            except:
                pass
            current_url = page.url
            if "feed" in current_url or "mynetwork" in current_url or current_url == "https://www.linkedin.com/":
                print("✅ LinkedIn login successful")
                # Save cookies for future requests
                cookies = await context.cookies()
                _COOKIE_FILE.write_text(json.dumps(cookies))
                print(f"🍪 Session saved to {_COOKIE_FILE}")
            elif "checkpoint" in current_url or "challenge" in current_url:
                print("⚠️ LinkedIn 2FA/CAPTCHA required — cannot proceed automatically")
            elif "login" in current_url:
                print("❌ LinkedIn login failed — check credentials in backend/.env")
            else:
                # Still save cookies — may have succeeded in a different way
                cookies = await context.cookies()
                _COOKIE_FILE.write_text(json.dumps(cookies))
                print(f"✅ LinkedIn session saved (landed at: {current_url})")

        except Exception as e:
            print(f"❌ Login error: {e}")
        finally:
            await page.close()

    async def _is_session_valid(self, page: Page) -> bool:
        """Check if the current session is still valid (not redirected to login)."""
        return "login" not in page.url and "authwall" not in page.url

    async def fetch_page(self, url: str) -> str:
        """
        Fetch the fully rendered HTML of a LinkedIn post.
        Uses authenticated session — falls back to re-login if session expired.
        """
        async with async_playwright() as p:
            context, browser = await self._get_authenticated_context(p)
            page = await context.new_page()

            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(4000)  # Let dynamic content load

                # If we hit the login wall, the session has expired — re-login
                if not await self._is_session_valid(page):
                    print("🔄 Session expired — re-logging in...")
                    _COOKIE_FILE.unlink(missing_ok=True)  # Clear stale cookies
                    await page.close()
                    await context.close()
                    await browser.close()

                    # Start fresh
                    async with async_playwright() as p2:
                        context2, browser2 = await self._get_authenticated_context(p2)
                        page2 = await context2.new_page()
                        await page2.goto(url, wait_until="networkidle", timeout=45000)
                        await page2.wait_for_timeout(4000)
                        html = await page2.content()
                        await browser2.close()
                    return html

                # Try to expand "see more" on post text
                try:
                    see_more = page.locator("button.feed-shared-inline-show-more-text__button, button[aria-label*='more']").first
                    if await see_more.is_visible(timeout=2000):
                        await see_more.click()
                        await page.wait_for_timeout(1000)
                except Exception:
                    pass

                html = await page.content()

            except Exception as e:
                print(f"⚠️ Page fetch error: {e}")
                try:
                    html = await page.content()
                except Exception:
                    html = ""
            finally:
                await page.close()
                await browser.close()

        return html

    def extract_post_data(self, html: str) -> dict:
        """
        Parse the rendered LinkedIn HTML and extract:
        - post_text: the full post body
        - author: the poster's name
        - date: relative post date
        - pdf_urls: direct PDF download links (LinkedIn document carousels)
        - carousel_image_urls: slide images (when PDF isn't directly available)
        - document_title: title of any attached document
        - has_attachment: bool
        """
        soup = BeautifulSoup(html, "lxml")
        result = {
            "post_text": "",
            "author": "",
            "date": "",
            "pdf_urls": [],
            "carousel_image_urls": [],
            "document_title": "",
            "has_attachment": False,
        }

        # ── Extract post text ─────────────────────────────────────────────────
        # Logged-in LinkedIn uses these selectors for post body text
        text_selectors = [
            ".update-components-text span[dir='ltr']",
            ".feed-shared-update-v2__description span[dir='ltr']",
            "span.break-words span[dir='ltr']",
            ".feed-shared-text__text-view",
            ".update-components-text",
            "div.feed-shared-text",
            "span[dir='ltr']",
        ]
        for selector in text_selectors:
            elements = soup.select(selector)
            if elements:
                parts = [el.get_text(separator=" ", strip=True) for el in elements]
                text = " ".join(parts[:8])  # First 8 blocks max
                if len(text) > 50:  # Only use if we got meaningful text
                    result["post_text"] = text
                    break

        # Fallback: og:description (often has first 2-3 sentences of post)
        if not result["post_text"]:
            meta = (
                soup.find("meta", {"property": "og:description"}) or
                soup.find("meta", {"name": "description"})
            )
            if meta and meta.get("content"):
                result["post_text"] = meta["content"]

        # ── Extract author ────────────────────────────────────────────────────
        author_selectors = [
            ".update-components-actor__name span[aria-hidden='true']",
            ".update-components-actor__name",
            ".feed-shared-actor__name",
            ".feed-shared-actor__title",
            "a.app-aware-link span.visually-hidden",
        ]
        for selector in author_selectors:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                if text and len(text) > 2:
                    result["author"] = text
                    break

        # Fallback: og:title contains "Author Name on LinkedIn: ..."
        if not result["author"]:
            og_title = soup.find("meta", {"property": "og:title"})
            if og_title and og_title.get("content"):
                content = og_title["content"]
                if " on LinkedIn" in content:
                    result["author"] = content.split(" on LinkedIn")[0].strip()

        # ── Extract date ──────────────────────────────────────────────────────
        date_selectors = [
            ".update-components-actor__sub-description span[aria-hidden='true']",
            ".feed-shared-actor__sub-description",
            "time.feed-shared-actor__sub-description",
        ]
        for selector in date_selectors:
            el = soup.select_one(selector)
            if el:
                result["date"] = el.get_text(strip=True).split("•")[0].strip()
                break

        # ── Extract PDF download URL ──────────────────────────────────────────
        # LinkedIn often embeds the original document URL in the JSON payload (transcribedDocumentUrl)
        import re
        document_urls = re.findall(r'https://media\.licdn\.com/dms/document/media/[a-zA-Z0-9_\-\/\.\?=\&;]+', html)
        for d_url in document_urls:
            clean_url = d_url.replace('&amp;', '&')
            if clean_url not in result["pdf_urls"]:
                result["pdf_urls"].append(clean_url)
                result["has_attachment"] = True

        # Look for direct .pdf links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if ".pdf" in href.lower() or "dms/document" in href.lower() or ("licdn.com" in href and "document" in href):
                if href.startswith("/"):
                    href = f"https://www.linkedin.com{href}"
                if href not in result["pdf_urls"]:
                    result["pdf_urls"].append(href)
                    result["has_attachment"] = True

        # (Legacy image stitching for slides is removed to avoid scraping profile pictures instead)

        print(f"📊 Extraction: text={len(result['post_text'])} chars, "
              f"author='{result['author']}', "
              f"pdfs={len(result['pdf_urls'])}, "
              f"slides={len(result['carousel_image_urls'])}")

        return result

    async def fetch_pdf_bytes(self, url: str) -> bytes | None:
        """
        Download a PDF or document from a LinkedIn URL.
        Uses the authenticated session so LinkedIn serves the actual file.
        """
        async with async_playwright() as p:
            context, browser = await self._get_authenticated_context(p)
            page = await context.new_page()

            pdf_bytes = None

            try:
                # Intercept the network response for PDF files
                async def handle_response(response):
                    nonlocal pdf_bytes
                    content_type = response.headers.get("content-type", "")
                    if "pdf" in content_type or "octet-stream" in content_type:
                        if response.status == 200:
                            pdf_bytes = await response.body()

                page.on("response", handle_response)

                await page.goto(url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(2000)

                # If no PDF intercepted via network, try finding download link
                if not pdf_bytes:
                    # Look for download button in LinkedIn document viewer
                    download_selectors = [
                        "a[aria-label*='Download']",
                        "button[aria-label*='Download']",
                        "a[download]",
                        "[data-test-id='download-document']",
                    ]
                    for selector in download_selectors:
                        try:
                            el = page.locator(selector).first
                            if await el.is_visible(timeout=2000):
                                href = await el.get_attribute("href")
                                if href:
                                    # Download via httpx with session cookies
                                    cookies = await context.cookies()
                                    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                                    async with httpx.AsyncClient(
                                        timeout=60.0,
                                        follow_redirects=True,
                                        headers={
                                            "Cookie": cookie_str,
                                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                                        }
                                    ) as client:
                                        resp = await client.get(href)
                                        if resp.status_code == 200:
                                            pdf_bytes = resp.content
                                break
                        except Exception:
                            continue

            except Exception as e:
                print(f"⚠️ PDF download error: {e}")
            finally:
                await page.close()
                await browser.close()

        return pdf_bytes

    async def download_slide_images(self, image_urls: list[str]) -> list[bytes]:
        """
        Download carousel slide images using LinkedIn session cookies.
        Returns list of raw image bytes (JPEG).
        """
        if not image_urls:
            return []

        async with async_playwright() as p:
            context, browser = await self._get_authenticated_context(p)
            cookies = await context.cookies()
            cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
            await browser.close()

        images = []
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "Cookie": cookie_str,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                "Referer": "https://www.linkedin.com/",
            }
        ) as client:
            for url in image_urls[:40]:  # Cap at 40 slides
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        images.append(resp.content)
                except Exception as e:
                    print(f"⚠️ Slide download failed: {e}")

        return images

    def clear_session(self):
        """Clear saved LinkedIn session (forces re-login on next run)."""
        _COOKIE_FILE.unlink(missing_ok=True)
        print("🗑️ LinkedIn session cleared")


# Singleton instance
linkedin_scraper = LinkedInScraper()
