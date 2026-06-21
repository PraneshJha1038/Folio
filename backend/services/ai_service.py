import os
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Shelf, ShelfItem, ContentSource, LibraryItem

async def generate_suggestions(
    user_id: int, 
    time_minutes: int, 
    current_wpm: int, 
    db: AsyncSession
):
    """
    Background task to generate suggestions via Anthropic API and write them 
    back to the database as a new Shelf.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY is not set.")
        return
        
    client = AsyncAnthropic(api_key=api_key)
    
    max_words = time_minutes * current_wpm
    
    # Fetch some global content under the word count limit
    stmt = select(ContentSource).where(
        ContentSource.visibility == 'global',
        ContentSource.word_count <= max_words
    ).limit(50)
    
    result = await db.execute(stmt)
    candidates = result.scalars().all()
    
    if not candidates:
        print(f"No suitable candidates found for user {user_id} within time budget.")
        return
        
    candidate_text = "\n".join([f"- ID: {c.id}, Title: {c.title}, Words: {c.word_count}" for c in candidates])
    
    prompt = f"""
    The user has {time_minutes} minutes to read. Their reading speed is {current_wpm} words per minute.
    Maximum words they can read: {max_words}.
    
    Here are some available articles:
    {candidate_text}
    
    Please recommend 3-5 of these that offer the best use of their time. 
    Return ONLY a comma-separated list of the suggested article IDs, like: 12,45,8
    """
    
    try:
        response = await client.messages.create(
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
            model="claude-3-haiku-20240307",
        )
        suggested_ids_text = response.content[0].text.strip()
        
        # Parse IDs safely
        suggested_ids = []
        for x in suggested_ids_text.split(','):
            try:
                suggested_ids.append(int(x.strip()))
            except ValueError:
                pass
                
        if not suggested_ids:
            return
            
        # Write to DB as a Shelf
        shelf = Shelf(
            user_id=user_id,
            name=f"Suggested: {time_minutes}m Budget",
        )
        db.add(shelf)
        await db.flush()
        
        # Ensure they are in the user's library and add to shelf
        for content_id in suggested_ids:
            li_stmt = select(LibraryItem).where(
                LibraryItem.user_id == user_id,
                LibraryItem.content_id == content_id
            )
            li_res = await db.execute(li_stmt)
            library_item = li_res.scalar_one_or_none()
            
            if not library_item:
                library_item = LibraryItem(user_id=user_id, content_id=content_id)
                db.add(library_item)
                await db.flush()
                
            shelf_item = ShelfItem(shelf_id=shelf.id, library_item_id=library_item.id)
            db.add(shelf_item)
            
        await db.commit()
        print(f"Successfully generated suggestions shelf for user {user_id}.")
        
    except Exception as e:
        print(f"AI Service error for user {user_id}: {e}")
