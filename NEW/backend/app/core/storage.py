"""Binary blob storage accessor.

This is the single seam between the application and wherever document bytes
actually live. Today it persists to Postgres (the ``stored_blobs`` table); to move
to S3/GCS in production you reimplement ``put``/``get``/``delete`` here (write the
object, return its key) and nothing else in the codebase changes.

Keys are opaque, content-addressed-style random hex — callers persist the returned
key on their own row (e.g. ``DocumentVersion.blob_key``) and read it back later.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.models import StoredBlob


async def put(
    db: AsyncSession,
    data: bytes,
    *,
    content_type: str = "application/octet-stream",
    filename: str | None = None,
) -> str:
    """Store bytes, return an opaque storage key."""
    key = uuid.uuid4().hex
    db.add(StoredBlob(key=key, data=data, content_type=content_type,
                      filename=filename, size=len(data or b"")))
    await db.flush()
    return key


async def get(db: AsyncSession, key: str) -> tuple[bytes, str, str | None] | None:
    """Return (data, content_type, filename) for a key, or None if missing."""
    blob = await db.get(StoredBlob, key)
    if not blob:
        return None
    return blob.data, blob.content_type, blob.filename


async def delete(db: AsyncSession, key: str) -> None:
    blob = await db.get(StoredBlob, key)
    if blob:
        await db.delete(blob)


async def exists(db: AsyncSession, key: str) -> bool:
    return (await db.execute(
        select(StoredBlob.key).where(StoredBlob.key == key)
    )).scalar() is not None
