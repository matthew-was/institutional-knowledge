"""Unit tests for QueryRouter interface and PassthroughQueryRouter (Task 13)."""

from query.implementations.passthrough_router import PassthroughQueryRouter
from query.interfaces.query_router import RouteDecision
from query.router_factory import create_query_router
from shared.config import (
    LLMBaseConfig,
    QueryConfig,
    QueryContextAssemblyConfig,
    QuerySynthesisConfig,
    QueryVectorSearchConfig,
)

_OLLAMA_LLM = LLMBaseConfig(
    PROVIDER="ollama",
    BASE_URL="http://localhost:11434",
    MODEL="llama3.2",
)


def _make_query_config(router: str = "passthrough") -> QueryConfig:
    return QueryConfig(
        ROUTER=router,
        LLM=_OLLAMA_LLM,
        VECTOR_SEARCH=QueryVectorSearchConfig(TOP_K=20),
        CONTEXT_ASSEMBLY=QueryContextAssemblyConfig(
            TOKEN_BUDGET=4000,
            INCLUDE_PARENT_METADATA=True,
        ),
        SYNTHESIS=QuerySynthesisConfig(
            LLM=_OLLAMA_LLM,
            CITATION_FIELDS=["DOCUMENT_TYPE"],
        ),
    )


def test_passthrough_router_strategy_is_always_vector() -> None:
    """Pass-through router returns strategy='vector' regardless of query text."""
    router = PassthroughQueryRouter()

    result_one = router.route("who owned lot 12 in 1952?")
    result_two = router.route("graph-related question about relationships")
    result_three = router.route("")

    assert result_one.strategy == "vector"
    assert result_two.strategy == "vector"
    assert result_three.strategy == "vector"


def test_passthrough_router_extracted_entities_is_always_empty() -> None:
    """Pass-through router returns an empty extracted_entities list for any query."""
    router = PassthroughQueryRouter()

    result = router.route("find documents mentioning John Smith and Mary Jones")

    assert result.extracted_entities == []


def test_passthrough_router_reasoning_is_always_none() -> None:
    """Pass-through router returns reasoning=None for any query."""
    router = PassthroughQueryRouter()

    result = router.route("any query text")

    assert result.reasoning is None


def test_create_query_router_returns_passthrough_for_passthrough_config() -> None:
    """create_query_router returns PassthroughQueryRouter when ROUTER='passthrough'."""
    config = _make_query_config(router="passthrough")

    router = create_query_router(config)

    assert isinstance(router, PassthroughQueryRouter)
    # Confirm it is fully functional — not just the right type
    decision = router.route("test query")
    assert decision.strategy == "vector"
