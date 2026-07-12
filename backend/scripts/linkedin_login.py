import asyncio
from playwright.async_api import async_playwright
import os

SESSION_FILE = "linkedin_session.json"

async def main():
    print("=====================================================")
    print("🚀 Launching LinkedIn for Manual Login")
    print("=====================================================")
    print("A browser window will open.")
    print("Please log in to LinkedIn, solve any captchas/OTPs.")
    print("Once you see your feed, close the browser window or wait.")
    print("=====================================================\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        await page.goto("https://www.linkedin.com/login")
        
        print("Waiting for you to log in...")
        
        # Wait until we reach the feed page
        try:
            await page.wait_for_url("**/feed/**", timeout=120000) # Wait up to 2 minutes
            print("\n✅ Successfully logged in!")
        except Exception as e:
            print("\n❌ Timed out waiting for login or browser was closed.")
            
        print("Saving session...")
        await context.storage_state(path=SESSION_FILE)
        print(f"Session saved to {SESSION_FILE}. The backend scraper will now use this!")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
