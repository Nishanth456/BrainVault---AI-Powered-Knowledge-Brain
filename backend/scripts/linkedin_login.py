"""
linkedin_login.py — Manual LinkedIn login helper.

Launches a headed browser so you can log in manually (including 2FA/captcha).
Saves the Playwright storage state to the exact path the backend scraper
expects: backend/linkedin_session.json

Usage:
    cd backend
    python scripts/linkedin_login.py
"""
import asyncio
import sys
from pathlib import Path

# Add backend root to path so we can import config if needed
BACKEND_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from playwright.async_api import async_playwright

# Save next to backend/tools/browser.py's _COOKIE_FILE expectation
SESSION_FILE = BACKEND_ROOT / "linkedin_session.json"
LOGIN_DUMP_FILE = BACKEND_ROOT / "login_dump.html"


async def main():
    print("=" * 53)
    print("🚀 LinkedIn Manual Login — BrainVault")
    print("=" * 53)
    print("A browser window will open.")
    print("Please log in to LinkedIn and solve any captchas/OTPs.")
    print("Once you see your feed, the session will be saved automatically.")
    print("=" * 53 + "\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        page = await context.new_page()

        await page.goto("https://www.linkedin.com/login")
        print("Waiting for you to log in...")

        try:
            # Wait until we reach the feed page (or any clear post-login page)
            await page.wait_for_url("**/feed/**", timeout=120000)
            print("\n✅ Successfully logged in!")
        except Exception as e:
            current = page.url
            if "feed" in current or "mynetwork" in current or current == "https://www.linkedin.com/":
                print("\n✅ Logged in (detected via current URL)")
            else:
                print(f"\n❌ Timed out waiting for login or browser was closed.")
                print(f"   Last URL: {current}")
                # Save debug dump so the user can inspect what LinkedIn showed
                try:
                    html = await page.content()
                    LOGIN_DUMP_FILE.write_text(html, encoding="utf-8")
                    print(f"   Debug dump saved to: {LOGIN_DUMP_FILE}")
                except Exception as dump_err:
                    print(f"   Could not save debug dump: {dump_err}")
                await browser.close()
                return

        # Ensure the target directory exists
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)

        print("Saving session...")
        await context.storage_state(path=str(SESSION_FILE))
        print(f"✅ Session saved to: {SESSION_FILE}")
        print("   The backend scraper will now use this session.\n")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
