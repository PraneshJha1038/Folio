from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_user
from models import LibraryItem, ContentSource, Shelf, ShelfItem, User
from schemas import (
    LibraryItemResponse, LibraryItemCreate, LibraryItemUpdate,
    ShelfResponse, ShelfCreate, ShelfUpdate, ShelfItemResponse
)

router = APIRouter(tags=["library"])

# ----------------- LIBRARY ENDPOINTS -----------------

@router.post("/library", response_model=LibraryItemResponse)
async def add_to_library(
    body: LibraryItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if content source exists
    content_query = await db.execute(select(ContentSource).where(ContentSource.id == body.content_id))
    content = content_query.scalar_one_or_none()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    # Check if already in library
    existing_query = await db.execute(
        select(LibraryItem).where(
            and_(LibraryItem.user_id == current_user.id, LibraryItem.content_id == body.content_id)
        )
    )
    existing = existing_query.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content is already in your library"
        )
        
    library_item = LibraryItem(
        user_id=current_user.id,
        content_id=body.content_id,
        is_finished=False
    )
    db.add(library_item)
    await db.commit()
    await db.refresh(library_item)
    
    # Reload with content source for response schema
    item_query = await db.execute(
        select(LibraryItem)
        .options(selectinload(LibraryItem.content_source))
        .where(LibraryItem.id == library_item.id)
    )
    return item_query.scalar_one()

@router.get("/library")
async def get_library(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(LibraryItem).where(LibraryItem.user_id == current_user.id)
    
    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # Eager load content_source
    items_query = query.options(selectinload(LibraryItem.content_source)).limit(limit).offset(offset)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@router.get("/library/{id}", response_model=LibraryItemResponse)
async def get_library_item(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(LibraryItem).options(selectinload(LibraryItem.content_source)).where(
        and_(LibraryItem.id == id, LibraryItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
    return item

@router.patch("/library/{id}", response_model=LibraryItemResponse)
async def update_library_item(
    id: int,
    body: LibraryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(LibraryItem).options(selectinload(LibraryItem.content_source)).where(
        and_(LibraryItem.id == id, LibraryItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    if body.current_position is not None:
        item.current_position = body.current_position
        item.last_opened_at = datetime.now(timezone.utc)
        
    if body.is_finished is not None:
        # If toggled to finished
        if body.is_finished and not item.is_finished:
            item.is_finished = True
            item.finished_at = datetime.now(timezone.utc)
        elif not body.is_finished:
            item.is_finished = False
            item.finished_at = None
            
    if body.is_favorite is not None:
        item.is_favorite = body.is_favorite
            
    await db.commit()
    await db.refresh(item)
    return item

@router.delete("/library/{id}")
async def delete_library_item(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(LibraryItem).where(
        and_(LibraryItem.id == id, LibraryItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    await db.delete(item)
    await db.commit()
    return {"message": "Library item removed successfully"}

# ----------------- SHELVES ENDPOINTS -----------------

@router.post("/shelves", response_model=ShelfResponse)
async def create_shelf(
    body: ShelfCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    shelf = Shelf(
        user_id=current_user.id,
        name=body.name,
        sort_order=body.sort_order
    )
    db.add(shelf)
    await db.commit()
    await db.refresh(shelf)
    return shelf

@router.get("/shelves")
async def get_shelves(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Shelf).where(Shelf.user_id == current_user.id).order_by(Shelf.sort_order.asc())
    
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    items_query = query.limit(limit).offset(offset)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@router.patch("/shelves/{id}", response_model=ShelfResponse)
async def update_shelf(
    id: int,
    body: ShelfUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Shelf).where(
        and_(Shelf.id == id, Shelf.user_id == current_user.id)
    )
    result = await db.execute(query)
    shelf = result.scalar_one_or_none()
    
    if not shelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shelf not found"
        )
        
    if body.name is not None:
        shelf.name = body.name
    if body.sort_order is not None:
        shelf.sort_order = body.sort_order
        
    await db.commit()
    await db.refresh(shelf)
    return shelf

@router.delete("/shelves/{id}")
async def delete_shelf(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Shelf).where(
        and_(Shelf.id == id, Shelf.user_id == current_user.id)
    )
    result = await db.execute(query)
    shelf = result.scalar_one_or_none()
    
    if not shelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shelf not found"
        )
        
    await db.delete(shelf)
    await db.commit()
    return {"message": "Shelf deleted successfully"}

# ----------------- SHELF ITEMS ENDPOINTS -----------------

@router.get("/shelves/{id}/items")
async def get_shelf_items(
    id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify shelf belongs to user
    shelf_query = await db.execute(select(Shelf).where(and_(Shelf.id == id, Shelf.user_id == current_user.id)))
    shelf = shelf_query.scalar_one_or_none()
    if not shelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shelf not found"
        )

    # Fetch ShelfItems joined with LibraryItems and ContentSource
    query = (
        select(ShelfItem, LibraryItem)
        .join(LibraryItem, ShelfItem.library_item_id == LibraryItem.id)
        .options(selectinload(LibraryItem.content_source))
        .where(ShelfItem.shelf_id == id)
        .order_by(ShelfItem.sort_order.asc(), ShelfItem.added_at.desc())
    )

    count_query = select(func.count()).select_from(select(ShelfItem).where(ShelfItem.shelf_id == id).subquery())
    total = (await db.execute(count_query)).scalar_one()

    items_query = query.limit(limit).offset(offset)
    result = await db.execute(items_query)
    
    response_items = []
    for shelf_item, library_item in result:
        response_items.append({
            "id": shelf_item.library_item_id,
            "shelf_id": shelf_item.shelf_id,
            "sort_order": shelf_item.sort_order,
            "added_at": shelf_item.added_at,
            "library_item": library_item
        })

    return {
        "items": response_items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

class AddShelfItemBody(BaseModel):
    library_item_id: int

@router.post("/shelves/{id}/items", response_model=ShelfItemResponse)
async def add_item_to_shelf(
    id: int,
    body: AddShelfItemBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify shelf belongs to user
    shelf_query = await db.execute(select(Shelf).where(and_(Shelf.id == id, Shelf.user_id == current_user.id)))
    shelf = shelf_query.scalar_one_or_none()
    if not shelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shelf not found"
        )
        
    # Verify library item belongs to user
    item_query = await db.execute(
        select(LibraryItem).where(and_(LibraryItem.id == body.library_item_id, LibraryItem.user_id == current_user.id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    # Check if already on shelf
    existing_query = await db.execute(
        select(ShelfItem).where(and_(ShelfItem.shelf_id == id, ShelfItem.library_item_id == body.library_item_id))
    )
    existing = existing_query.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is already on this shelf"
        )
        
    shelf_item = ShelfItem(
        shelf_id=id,
        library_item_id=body.library_item_id,
        sort_order=0
    )
    db.add(shelf_item)
    await db.commit()
    await db.refresh(shelf_item)
    return shelf_item

@router.delete("/shelves/{id}/items/{library_item_id}")
async def remove_item_from_shelf(
    id: int,
    library_item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify shelf belongs to user
    shelf_query = await db.execute(select(Shelf).where(and_(Shelf.id == id, Shelf.user_id == current_user.id)))
    shelf = shelf_query.scalar_one_or_none()
    if not shelf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shelf not found"
        )
        
    # Check item
    item_query = await db.execute(
        select(ShelfItem).where(and_(ShelfItem.shelf_id == id, ShelfItem.library_item_id == library_item_id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found on this shelf"
        )
        
    await db.delete(item)
    await db.commit()
    return {"message": "Item removed from shelf"}
