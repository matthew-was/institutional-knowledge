"""Unit tests for context assembly step — Task 16 (pure function, Tier 1)."""

from query.context_assembly import AssembledContext, assemble_context
from query.interfaces.search_result import DocumentMetadata, SearchResult


def _make_doc(description: str = "A document") -> DocumentMetadata:
    return DocumentMetadata(
        description=description,
        date="1960-01-01",
        document_type=None,
    )


def _make_result(
    chunk_id: str,
    text: str,
    similarity_score: float,
) -> SearchResult:
    return SearchResult(
        chunk_id=chunk_id,
        document_id="doc-001",
        text=text,
        chunk_index=0,
        token_count=len(text) // 4,
        similarity_score=similarity_score,
        document=_make_doc(),
    )


def test_results_ordered_by_similarity_score_descending() -> None:
    """Assembled context chunks must be ordered by similarity score descending."""
    low = _make_result("chunk-low", "a" * 40, similarity_score=0.5)
    high = _make_result("chunk-high", "b" * 40, similarity_score=0.9)
    medium = _make_result("chunk-med", "c" * 40, similarity_score=0.7)

    # Pass results in arbitrary order — assembly must re-order them
    context = assemble_context(
        results=[low, high, medium],
        token_budget=1000,
        include_parent_metadata=False,
    )

    assert len(context.chunks) == 3
    assert context.chunks[0].chunk_id == "chunk-high"
    assert context.chunks[1].chunk_id == "chunk-med"
    assert context.chunks[2].chunk_id == "chunk-low"


def test_token_budget_causes_truncation() -> None:
    """When the budget is exhausted before all chunks are included, truncated=True."""
    # Each chunk is 40 chars → estimated 10 tokens each.
    # Budget of 15 fits one chunk (10 tokens) but not two (20 tokens).
    chunk_a = _make_result("chunk-a", "a" * 40, similarity_score=0.9)
    chunk_b = _make_result("chunk-b", "b" * 40, similarity_score=0.5)

    context = assemble_context(
        results=[chunk_a, chunk_b],
        token_budget=15,
        include_parent_metadata=False,
    )

    assert context.truncated is True
    assert len(context.chunks) == 1
    assert context.chunks[0].chunk_id == "chunk-a"


def test_all_chunks_fit_within_budget_truncated_false() -> None:
    """When all chunks fit within the budget, truncated=False."""
    chunk_a = _make_result("chunk-a", "a" * 40, similarity_score=0.9)
    chunk_b = _make_result("chunk-b", "b" * 40, similarity_score=0.5)
    # Each chunk is 40 chars → 10 tokens each; total 20 tokens well within budget 1000.

    context = assemble_context(
        results=[chunk_a, chunk_b],
        token_budget=1000,
        include_parent_metadata=False,
    )

    assert context.truncated is False
    assert len(context.chunks) == 2


def test_empty_input_returns_empty_context_with_zero_tokens() -> None:
    """Empty input returns AssembledContext with no chunks and total_tokens=0."""
    context = assemble_context(
        results=[],
        token_budget=4000,
        include_parent_metadata=True,
    )

    assert isinstance(context, AssembledContext)
    assert context.chunks == []
    assert context.total_tokens == 0
    assert context.truncated is False


def test_chunks_after_budget_breach_are_excluded() -> None:
    """Chunks after the first budget breach are excluded (not gap-filled)."""
    # Large chunk (120 chars = 30 tokens) exceeds budget of 25
    large = _make_result("chunk-large", "x" * 120, similarity_score=0.9)
    # Small chunk (40 chars = 10 tokens) would fit if included, but comes after breach
    small = _make_result("chunk-small", "y" * 40, similarity_score=0.5)

    context = assemble_context(
        results=[large, small],
        token_budget=25,
        include_parent_metadata=False,
    )

    # Neither chunk should be included (large exceeds budget; small is after breach)
    assert len(context.chunks) == 0
    assert context.truncated is True
