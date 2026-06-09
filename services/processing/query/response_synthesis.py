"""Response synthesis step for the C3 query pipeline (ADR-042, US-069, UR-099, UR-100, UR-101)."""

import re
from dataclasses import dataclass, field

import structlog

from query.context_assembly import AssembledContext
from query.interfaces.search_result import SearchResult
from shared.interfaces.llm_service import LLMService

_NO_RESULTS_MESSAGE = "No relevant documents were found."

_CITATION_PATTERN = re.compile(r"\[Citation (\d+)\]")

_SYSTEM_PROMPT_HEADER = """\
You are an archivist assistant helping users find information in a historical document archive.

Rules you must follow:
1. Answer using ONLY the provided document excerpts. Do not use any general knowledge.
2. Do not give legal advice or legal interpretation of any document.
3. If the provided excerpts do not contain information relevant to the question, state explicitly that no relevant documents were found.
4. When referring to information from a document excerpt, cite it using the citation marker shown before that excerpt (e.g. [Citation 1]).

Document excerpts:

"""

_QUERY_SEPARATOR = "\n\nUser question: "


@dataclass
class CitationResult:
    """A source chunk referenced in the synthesis response (Task 17)."""

    chunk_id: str
    document_id: str
    document_description: str
    document_date: str


@dataclass
class SynthesisResult:
    """The final output of the C3 response synthesis step (Task 17)."""

    response_text: str
    citations: list[CitationResult] = field(default_factory=list)
    no_results: bool = False


def format_chunks_with_citations(chunks: list[SearchResult]) -> str:
    """Format a list of search result chunks into a numbered citation block.

    Each chunk is preceded by metadata headers (date, document type) and a
    citation marker so the LLM can reference specific sources in its response.

    Args:
        chunks: Search result chunks in the order they should appear in the prompt.

    Returns:
        A multi-line string ready to be embedded in the synthesis prompt.
    """
    parts: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        doc = chunk.document
        doc_type = doc.document_type if doc.document_type is not None else "unknown"
        header = f"[From {doc.date}, document type: {doc_type}]"
        citation = f"[Citation {index}] {chunk.text}"
        parts.append(f"{header}\n{citation}")
    return "\n\n".join(parts)


def _extract_citation_numbers(response_text: str) -> list[int]:
    """Return a sorted, deduplicated list of citation numbers found in response_text."""
    matches = _CITATION_PATTERN.findall(response_text)
    seen: set[int] = set()
    result: list[int] = []
    for m in matches:
        n = int(m)
        if n not in seen:
            seen.add(n)
            result.append(n)
    result.sort()
    return result


async def synthesize_response(
    assembled_context: AssembledContext,
    query_text: str,
    llm_service: LLMService,
    log: structlog.BoundLogger,
) -> SynthesisResult:
    """Produce a cited synthesis response for the given query and assembled context.

    If the assembled context contains no chunks, returns immediately with
    ``no_results=True`` and the standard no-results message — no LLM call is made.

    Otherwise, formats the chunks with citation markers, builds a synthesis prompt,
    calls the LLM via ``llm_service.synthesize()``, parses citation markers from the
    response, and maps them back to their source chunks.

    Citation markers that fall outside the range 1..len(chunks) are skipped with a
    warning log entry. The response text is returned as-is.

    On LLM failure the exception propagates to the caller (no partial synthesis).

    Args:
        assembled_context: The context assembled by Task 16.
        query_text: The original user query text.
        llm_service: An LLMService instance used to perform the synthesis call.
        log: A bound structlog logger for structured diagnostic output.

    Returns:
        A ``SynthesisResult`` with the response text, resolved citations, and a
        ``no_results`` flag.
    """
    if not assembled_context.chunks:
        return SynthesisResult(
            response_text=_NO_RESULTS_MESSAGE,
            citations=[],
            no_results=True,
        )

    chunks = assembled_context.chunks
    formatted_excerpts = format_chunks_with_citations(chunks)
    prompt = _SYSTEM_PROMPT_HEADER + formatted_excerpts + _QUERY_SEPARATOR + query_text

    llm_result = await llm_service.synthesize(prompt)

    citation_numbers = _extract_citation_numbers(llm_result.response_text)

    citations: list[CitationResult] = []
    for number in citation_numbers:
        chunk_index = number - 1  # citation numbers are 1-based
        if chunk_index < 0 or chunk_index >= len(chunks):
            log.warning(
                "synthesis response contained out-of-range citation marker",
                citation_number=number,
                chunk_count=len(chunks),
            )
            continue
        source: SearchResult = chunks[chunk_index]
        citations.append(
            CitationResult(
                chunk_id=source.chunk_id,
                document_id=source.document_id,
                document_description=source.document.description,
                document_date=source.document.date,
            )
        )

    return SynthesisResult(
        response_text=llm_result.response_text,
        citations=citations,
        no_results=False,
    )
