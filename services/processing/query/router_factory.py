"""Factory for QueryRouter implementations (ADR-040, ADR-042)."""

from query.implementations.passthrough_router import PassthroughQueryRouter
from query.interfaces.query_router import QueryRouter
from shared.config import QueryConfig


def create_query_router(config: QueryConfig) -> QueryRouter:
    """Create the configured QueryRouter implementation.

    Reads config.ROUTER to select the implementation:
    - "passthrough": returns PassthroughQueryRouter (Phase 1)

    Raises ValueError for unknown router values.
    """
    if config.ROUTER == "passthrough":
        return PassthroughQueryRouter()
    raise ValueError(f"Unknown query router: {config.ROUTER!r}")
