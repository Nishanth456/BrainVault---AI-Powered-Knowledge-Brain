import asyncio
import httpx
import sys
import json

async def test_ingest(url: str):
    async with httpx.AsyncClient() as client:
        print(f"Sending ingestion request for {url}...")
        resp = await client.post("http://localhost:8000/api/ingest", json={"raw_input": url})
        print(resp.status_code)
        print(json.dumps(resp.json(), indent=2))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(test_ingest(sys.argv[1]))
    else:
        print("Usage: python test_ingest.py <url>")
