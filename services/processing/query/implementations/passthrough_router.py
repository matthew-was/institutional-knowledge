"""PassthroughQueryRouter — Phase 1 pass-through implementation (ADR-040, ADR-042)."""

from query.interfaces.query_router import QueryRouter, RouteDecision


class PassthroughQueryRouter(QueryRouter):
    """Phase 1 query router that always routes to vector search.

    Ignores the query text and returns a fixed RouteDecision with
    strategy='vector', empty extracted_entities, and no reasoning.
    Phase 2 will introduce an LLMQueryRouter that classifies the query.
    """

    def route(self, query_text: str) -> RouteDecision:
        """Return a fixed vector-strategy decision regardless of query text."""
        return RouteDecision(
            strategy="vector",
            extracted_entities=[],
            reasoning=None,
        )
