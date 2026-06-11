"""Placeholder endpoints for modules shown as nav stubs this pass."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["stubs"])


@router.get("/ticketing/status")
async def ticketing_status():
    return {"module": "ticketing", "status": "coming_soon"}


@router.get("/ai-search/status")
async def ai_search_status():
    return {"module": "ai_search", "status": "coming_soon"}


@router.get("/ai-chat/status")
async def ai_chat_status():
    return {"module": "ai_chat", "status": "coming_soon"}
