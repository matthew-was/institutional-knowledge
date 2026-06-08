"""Context assembly step for the C3 query pipeline (ADR-042)."""

from dataclasses import dataclass, field

from query.interfaces.search_result import SearchResult


@dataclass
class AssembledContext:
    """The result of assembling retrieved chunks within a token budget."""

    chunks: list[SearchResult] = field(default_factory=list)
    total_tokens: int = 0
    truncated: bool = False
    include_parent_metadata: bool = False


def assemble_context(
    results: list[SearchResult],
    token_budget: int,
    include_parent_metadata: bool,
) -> AssembledContext:
    """Assemble retrieved search results into a context payload within a token budget.

    Results are sorted by similarity score descending. Chunks are accumulated until
    the token budget is exhausted or all chunks have been included. Token count is
    estimated as ``len(chunk.text) // 4`` (roughly 4 characters per token).

    Args:
        results: Search results from the vector search step (QUERY-001).
        token_budget: Maximum number of tokens to include in the assembled context.
        include_parent_metadata: Whether document-level metadata should be included
            alongside chunk text when constructing the synthesis prompt (Task 17).

    Returns:
        An ``AssembledContext`` dataclass with the selected chunks, total estimated
        token count, a truncation flag, and the ``include_parent_metadata`` flag.
    """
    if not results:
        return AssembledContext(
            chunks=[],
            total_tokens=0,
            truncated=False,
            include_parent_metadata=include_parent_metadata,
        )

    sorted_results = sorted(results, key=lambda r: r.similarity_score, reverse=True)

    selected: list[SearchResult] = []
    total_tokens = 0
    truncated = False

    for result in sorted_results:
        estimated_tokens = len(result.text) // 4
        if total_tokens + estimated_tokens > token_budget:
            truncated = True
            break
        selected.append(result)
        total_tokens += estimated_tokens

    return AssembledContext(
        chunks=selected,
        total_tokens=total_tokens,
        truncated=truncated,
        include_parent_metadata=include_parent_metadata,
    )
