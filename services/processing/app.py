"""FastAPI application entry point (ADR-042)."""

from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
