import trafilatura
import asyncio
import json

async def extract_article(url: str) -> dict:
    """
    Scrapes an article from the given URL using trafilatura.
    Runs synchronously in a thread pool to avoid blocking the async event loop.
    """
    loop = asyncio.get_running_loop()
    def _scrape():
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            raise ValueError(f"Failed to fetch content from {url}")
        
        result = trafilatura.extract(downloaded, output_format="json")
        if not result:
            # Fallback to plain text if JSON extraction fails
            text = trafilatura.extract(downloaded)
            return {
                "title": "Unknown Title", 
                "text": text or "", 
                "author": None
            }
        
        data = json.loads(result)
        return {
            "title": data.get("title", "Unknown Title"),
            "author": data.get("author", None),
            "text": data.get("raw_text", data.get("text", "")),
        }
    
    return await loop.run_in_executor(None, _scrape)
