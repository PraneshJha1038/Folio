import trafilatura
from fastapi import HTTPException, status

def scrape_url(url: str) -> dict:
    """
    Synchronously scrapes a URL using trafilatura and extracts:
      - title
      - text content
      - word count (estimated)
    
    Returns a dictionary of results or raises an HTTPException.
    """
    try:
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch content from the URL: {url}"
            )
        
        # Extract content
        extracted_text = trafilatura.extract(downloaded, include_comments=False, include_tables=True)
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract readable text from the URL"
            )
        
        # Extract metadata
        metadata = trafilatura.extract_metadata(downloaded)
        title = metadata.title if metadata and metadata.title else "Untitled Article"
        author = metadata.author if metadata and metadata.author else None
        
        word_count = len(extracted_text.split())
        
        return {
            "title": title,
            "author": author,
            "text": extracted_text,
            "word_count": word_count
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error scraping URL: {str(e)}"
        )
