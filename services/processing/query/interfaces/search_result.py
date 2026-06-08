"""SearchResult and DocumentMetadata dataclasses for vector search (QUERY-001)."""

from dataclasses import dataclass


@dataclass
class DocumentMetadata:
    """Document-level metadata joined from the documents table (QUERY-001 contract)."""

    description: str
    date: str
    document_type: str | None


@dataclass
class SearchResult:
    """A single result entry from the vector similarity search (QUERY-001 contract)."""

    chunk_id: str
    document_id: str
    text: str
    chunk_index: int
    token_count: int
    similarity_score: float
    document: DocumentMetadata
