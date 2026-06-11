"""Fake QueryRouter implementations for Tier 2 tests."""

from query.interfaces.query_router import QueryRouter, RouteDecision


class FakeQueryRouter(QueryRouter):
    """Fake QueryRouter that always returns a fixed RouteDecision."""

    def __init__(self, decision: RouteDecision | None = None) -> None:
        self._decision = decision or RouteDecision(
            strategy="vector",
            extracted_entities=[],
            reasoning=None,
        )

    def route(self, query_text: str) -> RouteDecision:
        return self._decision
