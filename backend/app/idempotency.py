"""Idempotency-Key support for mutating API requests.

A client sends the same key when it retries an operation whose outcome is unknown (timeout,
dropped connection). The first request claims the key; a repeat with the same method, path and
body replays the stored response instead of performing the operation twice; a repeat while the
first is still running receives 409; a reused key with a different request receives 422.
Server errors release the key so the client can retry.
"""

import hashlib
from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta
from typing import cast

from app.database import get_db
from app.models.ops import IdempotencyRecord
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

HEADER = "Idempotency-Key"
MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
RETENTION = timedelta(hours=24)
MAX_KEY_LENGTH = 100


def _open_session(app: FastAPI) -> tuple[Session, Generator[Session, None, None]]:
    # Respect dependency overrides so tests and alternative engines share the same database.
    provider = cast(Callable[[], Generator[Session, None, None]], app.dependency_overrides.get(get_db, get_db))
    generator = provider()
    return next(generator), generator


def _fingerprint(method: str, path: str, query: str, body: bytes) -> str:
    return hashlib.sha256(b"\n".join([method.encode(), path.encode(), query.encode(), body])).hexdigest()


def _release(db: Session, key: str) -> None:
    db.rollback()
    record = db.get(IdempotencyRecord, key)
    if record is not None and record.status != "COMPLETED":
        db.delete(record)
        db.commit()


def install_idempotency(app: FastAPI) -> None:
    @app.middleware("http")
    async def idempotency_middleware(request: Request, call_next):
        key = request.headers.get(HEADER)
        if request.method not in MUTATING_METHODS or not key or not request.url.path.startswith("/api/"):
            return await call_next(request)
        if len(key) > MAX_KEY_LENGTH:
            return JSONResponse({"detail": f"{HEADER} must be at most {MAX_KEY_LENGTH} characters."}, status_code=422)

        body = await request.body()
        fingerprint = _fingerprint(request.method, request.url.path, request.url.query, body)
        db, generator = _open_session(request.app)
        try:
            db.query(IdempotencyRecord).filter(
                IdempotencyRecord.created_at < datetime.now(UTC) - RETENTION
            ).delete(synchronize_session=False)
            db.add(IdempotencyRecord(key=key, fingerprint=fingerprint, status="PENDING"))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                existing = db.get(IdempotencyRecord, key)
                if existing is None:
                    return JSONResponse({"detail": "Idempotency key conflict; retry."}, status_code=409)
                if existing.fingerprint != fingerprint:
                    return JSONResponse(
                        {"detail": f"{HEADER} was already used for a different request."}, status_code=422
                    )
                if existing.status != "COMPLETED":
                    return JSONResponse({"detail": "The original request is still being processed."}, status_code=409)
                return Response(
                    content=existing.response_body or "",
                    status_code=existing.response_status or 200,
                    media_type="application/json",
                    headers={"Idempotent-Replayed": "true"},
                )

            try:
                response = await call_next(request)
                chunks = [chunk async for chunk in response.body_iterator]  # type: ignore[attr-defined]
            except Exception:
                _release(db, key)  # Unhandled failure: the operation rolled back, so allow a retry.
                raise
            payload = b"".join(c if isinstance(c, bytes) else c.encode() for c in chunks)

            record = db.get(IdempotencyRecord, key)
            if record is not None:
                if response.status_code >= 500:
                    db.delete(record)  # Allow a clean retry after server failure.
                else:
                    record.status = "COMPLETED"
                    record.response_status = response.status_code
                    record.response_body = payload.decode("utf-8", errors="replace")
                db.commit()
            headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
            return Response(content=payload, status_code=response.status_code, headers=headers,
                            media_type=response.media_type)
        finally:
            try:
                next(generator)
            except StopIteration:
                pass
