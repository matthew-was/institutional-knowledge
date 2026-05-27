"""
Query understanding step — first step of the C3 query pipeline (ADR-042).

Calls LLMService.understand_query() and returns a QueryUnderstandingResult.
The adapter handles prompt construction, JSON parsing, and safe fallback.
"""

import structlog

from shared.interfaces.llm_service import LLMService, QueryUnderstandingResult


async def run_query_understanding(
    query_text: str,
    llm_service: LLMService,
    log: structlog.BoundLogger,
) -> QueryUnderstandingResult:
    """Call the LLM to analyse the query and return structured understanding.

    On any LLM failure or malformed response the adapter returns a safe fallback
    (intent="unknown", refined_search_terms=query_text) — this function never raises.
    """
    log.info("query_understanding_started")
    result = await llm_service.understand_query(query_text)
    log.info("query_understanding_completed", intent=result.intent)
    return result
