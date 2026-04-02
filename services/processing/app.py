"""FastAPI application entry point (ADR-042)."""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from shared.config import config

app = FastAPI()


@app.middleware("http")
async def internal_key_auth_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.url.path == "/health":
        return await call_next(request)
    elif (
        "x-internal-key" not in request.headers
        or request.headers["x-internal-key"] != config.AUTH.INBOUND_KEY
    ):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    else:
        return await call_next(request)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process")
async def process_document() -> None:
    raise HTTPException(status_code=501, detail="Not implemented")


@app.post("/query")
async def query_documents() -> None:
    raise HTTPException(status_code=501, detail="Not implemented")
